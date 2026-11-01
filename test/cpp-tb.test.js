// Silinx HLS C++ (#2234): a test bench's class of strings and maps, run by the C simulation only (core/cpp-tb.js). The
// expected outputs are those of the same programs compiled by clang++.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';

const LIB = `
#include <map>
#include <string>
#include <vector>
#include <chrono>
#include <stdio.h>
#include <stdlib.h>
using namespace std;
namespace app { namespace opts {
bool is_number(const std::string& s) {
  std::string::const_iterator it = s.begin();
  while (it != s.end() && std::isdigit(*it)) ++it;
  return !s.empty() && it == s.end();
}
class Options {
public:
  class Item {
  public:
    Item() {}
    Item(const Item& o) { copyfrom(o); }
    void copyfrom(const Item& o) { this->name = o.name; this->value = o.value; this->seen = o.seen; }
    Item& operator=(const Item& o) { this->copyfrom(o); return *this; }
  public:
    string name;
    string value;
    bool seen;
  };
  Options();
  virtual ~Options();
  bool add(const Item& it);
  bool add(const string& name, const string& value = "7", bool seen = false);
  int parse(int argc, char* argv[]);
  string value(const char* key);
  int number(const char* key);
  double real(const char* key);
  virtual void list();
protected:
  bool lookup(const string& key, string& out);
private:
  map<string, Item*> m_items;
  map<string, string> m_alias;
  vector<Item*> m_all;
  string m_app;
};
Options::Options() { m_app = "none"; add("--help", "", true); }
Options::~Options() {
  for (size_t i = 0; i < m_all.size(); i++) { delete m_all[i]; m_all[i] = NULL; }
  m_all.resize(0);
}
bool Options::add(const Item& it) {
  Item c = it;
  if (m_items.find(c.name) != m_items.end()) { printf("taken %s\\n", c.name.c_str()); return false; }
  Item* p = new Item(c);
  m_all.push_back(p);
  m_items[it.name] = p;
  m_alias[it.name.substr(1, 2)] = it.name;
  return true;
}
bool Options::add(const string& name, const string& value, bool seen) {
  Item s;
  s.name = name;
  s.value = value;
  s.seen = seen;
  return add(s);
}
bool Options::lookup(const string& key, string& out) {
  out = "";
  if (m_items.find(key) == m_items.end()) return false;
  out = m_items[key]->value;
  return out.length() > 0;
}
int Options::parse(int argc, char* argv[]) {
  int i = 0;
  while (i < argc) { m_app = string(argv[i]); i++; }
  return i;
}
string Options::value(const char* key) {
  string k(key);
  if (k.find("--") != 0) k = "--" + k;
  string out;
  if (lookup(k, out)) return out;
  printf("unknown %s\\n", k.c_str());
  return string("");
}
int Options::number(const char* key) {
  string v = value(key);
  if (v.length() == 0 || !is_number(v)) return -1;
  return atoi(v.c_str());
}
double Options::real(const char* key) { return atof(value(key).c_str()); }
void Options::list() {
  string all = "";
  for (size_t i = 0; i < m_all.size(); i++) {
    Item* p = m_all[i];
    if (p && p->name.length() > 0) all = all + p->name;
  }
  printf("%s: %s (%d)\\n", m_app.c_str() == 0 ? "" : "app", all.c_str(), (int)m_items.size());
  map<string, string>::iterator a = m_alias.begin();
  while (a != m_alias.end()) { printf("%s=%s\\n", a->first.c_str(), a->second.c_str()); ++a; }
}
} }
using namespace app;
using namespace app::opts;
`;
const MAIN = `
int main(int argc, char** argv) {
  Options o;
  o.add("--zeta", "12");
  o.add("--alpha");
  o.add("--zeta", "13");
  o.add("--real", "2.5");
  o.add("--word", "12a");
  o.parse(argc, argv);
  int z = o.number("zeta");
  printf("%d %d %d %d\\n", z, o.number("--alpha"), o.number("word"), o.number("nope"));
  printf("%.2f\\n", o.real("real"));
  o.list();
  return z == 12 ? 0 : 1;
}
`;
const EXPECTED = `taken --zeta
unknown --nope
12 7 -1 -1
2.50
app: --help--zeta--alpha--real--word (5)
-a=--alpha
-h=--help
-r=--real
-w=--word
-z=--zeta
`;

const sim = (src, o = {}) => simulateC(src, { file: 'unit.cpp', ...o });

const noSynth = (r) => r.diagnostics.filter((d) => !/^no function to synthesize/.test(d.message));

test('a class of strings and maps runs in the C simulation, as clang++ compiles it', () => {
  const r = sim(LIB + MAIN);
  assert.deepEqual(noSynth(r), [], 'no warnings');
  assert.equal(r.error, null);
  assert.equal(r.exitCode, 0);
  assert.equal(r.output, EXPECTED);
});

test('the synthesis of a unit with such a class: its top function alone, the same HDL, no warnings', () => {
  const top = 'int top(int a) { return a + 1; }\n';
  for (const lang of ['vhdl', 'verilog']) {
    const alone = cToHdl(`${top}int main() { return top(1) == 2 ? 0 : 1; }\n`, { file: 'unit.cpp', lang, top: 'top' });
    const withClass = cToHdl(`${LIB}${top}${MAIN.replace('return z == 12 ? 0 : 1;', 'return top(z) == 13 ? 0 : 1;')}`, { file: 'unit.cpp', lang, top: 'top' });
    assert.equal(withClass.ok, true);
    assert.deepEqual(withClass.diagnostics, [], 'no warnings');
    assert.equal(withClass.hdl, alone.hdl);
  }
});

test('the synthesized function cannot use such a class', () => {
  const src = `${LIB}int top(int a) { Options o; return a + o.number("x"); }\nint main() { return top(1); }\n`;
  const g = cToHdl(src, { file: 'unit.cpp', lang: 'vhdl', top: 'top' });
  assert.equal(g.ok, false);
  assert.match(g.diagnostics.find((d) => d.severity === 'error').message, /runs in the C simulation only/);
});

test('a free function over strings, called from main', () => {
  const r = sim(`#include <string>
#include <stdio.h>
bool starts(const std::string& s, const std::string& p);
bool starts(const std::string& s, const std::string& p) { return s.find(p) == 0; }
int main() { printf("%d %d\\n", starts("--x", "--"), starts("x", "--")); return 0; }
`);
  assert.deepEqual(noSynth(r), []);
  assert.equal(r.output, '1 0\n');
});

test('argc and argv: the program alone', () => {
  const r = sim('#include <stdio.h>\nint main(int argc, char **argv) { printf("%d\\n", argc); return argc - 1; }\n');
  assert.equal(r.output, '1\n');
  assert.equal(r.exitCode, 0);
});

test('what it does not read or run is said, at its line', () => {
  const cases = [
    ['class B { public: string s; };\nclass A : public B { public: string t; };\n', /base class is not supported/, 2],
    ['class A { public: string s; int f() { return 6 / 2; } };\n', /a division in a test bench's class/, 1],
    ['class A { public: string s; A() : s("x") {} };\n', /initializer list is not supported/, 1],
  ];
  for (const [src, re, line] of cases) {
    const r = sim(`using namespace std;\n${src}int main() { return 0; }\n`);
    const e = r.diagnostics.find((d) => d.severity === 'error');
    assert.match(e.message, re);
    assert.equal(e.line, line + 1);
  }
  // (another use of the class than an object and its methods)
  const r = sim('using namespace std;\nclass A { public: string s; };\nint f(A *p) { return 0; }\nint g(int n) { A *q; return n; }\nint main() { return 0; }\n');
  assert.match(r.diagnostics.find((d) => d.severity === 'error').message, /the test bench's class 'A'/);
});

test('its errors when it runs stop the C simulation, with the output so far', () => {
  const cls = (body) => `#include <stdio.h>\nusing namespace std;\nclass A { public: string s; A* p; int run() { printf("in\\n"); ${body} return 0; } };\nint main() { A a; return a.run(); }\n`;
  for (const [body, re] of [
    ['string t = "-" + s[0];', /'\+' of a string and a char/],
    ['return p->s.length();', /of a null pointer/],
    ['return nope;', /'nope' is not declared/],
    ['s.push_back(1);', /std::string::push_back: not supported/],
    ['while (1) { }', /stopped after 1,000 steps/],
  ]) {
    const r = sim(cls(body), { maxSteps: 1000 });
    assert.equal(r.ok, false, body);
    assert.match(r.error.message, re);
    assert.equal(r.output, 'in\n');
    assert.equal(r.error.line, 3);
  }
});

test('a struct with a virtual function and no strings stays refused', () => {
  const r = sim('struct S { int a; virtual int f() { return a; } };\nint main() { return 0; }\n');
  assert.match(r.diagnostics.find((d) => d.severity === 'error').message, /a virtual function is not possible in hardware/);
});

test('a name "string" that is no type stays the source\'s', () => {
  const r = sim('#include <stdio.h>\nint f(char *string, int n) { return string[n]; }\nint main() { char s[2] = {3, 4}; printf("%d\\n", f(s, 1)); return 0; }\n');
  assert.equal(r.diagnostics.filter((d) => d.severity === 'error').length, 0);
  assert.equal(r.output, '4\n');
});

test('&a[0][0] points into the whole array; a[i][j] stays bounded (#2234)', () => {
  const r = sim(`#include <string.h>
#include <stdlib.h>
#include <stdio.h>
int main() {
  char a[2][3];
  for (int i = 0; i < 2; i++) for (int j = 0; j < 3; j++) a[i][j] = i * 3 + j;
  char *p = (char *)malloc(8);
  memcpy(p, &a[0][0], 6);
  printf("%d %d\\n", p[2], p[5]);
  char *q = &a[1][1];
  printf("%d %d\\n", q[0], q[-3]);
  return 0;
}
`);
  assert.equal(r.error, null);
  assert.equal(r.output, '2 5\n4 1\n');
  for (const [i, j, n] of [[2, 0, 2], [0, 3, 3], [-1, 0, -1]]) {
    const b = sim(`int main() { int a[2][3]; int i = ${i}, j = ${j}; return a[i][j]; }\n`);
    assert.match(b.error.message, new RegExp(`the index ${n} is outside the array`));
  }
});

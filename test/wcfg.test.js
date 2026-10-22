// The simulator's wave configuration file (#1019, core/wcfg.js): written and read back the same (the signals, their
// order and radix, the dividers, the groups, the markers), the text as ISim's .wcfg, a file written by ISim read, and
// what is not a wave configuration refused; the file's path in the project (wcfgPath, wcfgList).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeWcfg, readWcfg, wcfgPath, wcfgList } from '../core/wcfg.js';

const CFG = {
  tops: ['tb_top'],
  rows: [
    { kind: 'sig', path: '/tb_top/clk', name: 'clk', type: 'logic', radix: 'default', expanded: false },
    { kind: 'div', name: 'Counter' },
    { kind: 'sig', path: '/tb_top/uut/cnt', name: 'cnt', type: 'array', radix: 'hex', expanded: true },
    { kind: 'group', name: 'Outputs', expanded: false, rows: [
      { kind: 'sig', path: '/tb_top/led', name: 'led', type: 'array', radix: 'bin', expanded: false },
      { kind: 'div', name: '' },
    ] },
    { kind: 'sig', path: '/tb_top/uut/state', name: 'state', type: 'other', radix: 'default', expanded: false },
  ],
  markers: [100000, 2500000],
};

test('#1019 wcfg: written and read back the same', () => {
  assert.deepEqual(readWcfg(writeWcfg(CFG)), CFG);
  // every radix
  for (const radix of ['default', 'bin', 'hex', 'oct', 'udec', 'sdec', 'ascii']) {
    const c = { tops: ['t'], rows: [{ kind: 'sig', path: '/t/x', name: 'x', type: 'array', radix, expanded: false }], markers: [] };
    assert.deepEqual(readWcfg(writeWcfg(c)), c, radix);
  }
  // nothing shown, no top
  assert.deepEqual(readWcfg(writeWcfg({})), { tops: [], rows: [], markers: [] });
  // names with XML's special characters
  const odd = { tops: ['a&b'], rows: [{ kind: 'div', name: '<x> & "y" \'z\'' }, { kind: 'group', name: 'a<b', expanded: true, rows: [] }], markers: [0] };
  assert.deepEqual(readWcfg(writeWcfg(odd)), odd);
  assert.match(writeWcfg(odd), /<obj_property name="label">&lt;x&gt; &amp; &quot;y&quot; &apos;z&apos;<\/obj_property>/);
});

test('#1019 wcfg: the text is ISim\'s .wcfg', () => {
  const text = writeWcfg(CFG);
  assert.equal(text.split('\n')[0], '<?xml version="1.0" encoding="UTF-8"?>');
  assert.match(text, /<top_module name="tb_top" \/>/);
  assert.match(text, /<WVObjectSize size="5" \/>/);
  assert.match(text, /<wvobject fp_name="\/tb_top\/uut\/cnt" type="array">\n {6}<obj_property name="ElementShortName">cnt<\/obj_property>\n {6}<obj_property name="ObjectShortName">cnt<\/obj_property>\n {6}<obj_property name="Radix">HEXRADIX<\/obj_property>/);
  assert.match(text, /<wvobject fp_name="divider2" type="divider">\n {6}<obj_property name="label">Counter<\/obj_property>\n {6}<obj_property name="DisplayName">label<\/obj_property>\n {3}<\/wvobject>/);
  // a group's members inside it
  assert.match(text, /<wvobject fp_name="group4" type="group">[\s\S]*?<wvobject fp_name="\/tb_top\/led" type="array">[\s\S]*?<\/wvobject>[\s\S]*?<\/wvobject>\n {3}<\/wvobject>/);
  assert.match(text, /<wave_markers>\n {6}<marker time="100000" label="" \/>\n {6}<marker time="2500000" label="" \/>\n {3}<\/wave_markers>\n<\/wave_config>\n$/);
  // the default radix is not written; no markers, no <wave_markers>
  assert.doesNotMatch(writeWcfg({ rows: [{ kind: 'sig', path: '/t/x', radix: 'default' }] }), /Radix|wave_markers/);
});

test('#1019 wcfg: a file written by ISim (its other elements and properties ignored)', () => {
  const isim = `<?xml version="1.0" encoding="UTF-8"?>
<wave_config>
   <wave_state>
   </wave_state>
   <db_ref_list>
      <db_ref path="./isim.wdb" id="1" type="auto">
         <top_modules>
            <top_module name="numeric_std" />
            <top_module name="tb_top" />
         </top_modules>
      </db_ref>
   </db_ref_list>
   <zoom_setting>
      <ZoomStartTime time="0fs"></ZoomStartTime>
      <ZoomEndTime time="2000001fs"></ZoomEndTime>
      <Cursor1Time time="1000000fs"></Cursor1Time>
   </zoom_setting>
   <column_width_setting>
      <NameColumnWidth column_width="146"></NameColumnWidth>
      <ValueColumnWidth column_width="91"></ValueColumnWidth>
   </column_width_setting>
   <WVObjectSize size="3" />
   <wvobject type="logic" fp_name="/tb_top/clk">
      <obj_property name="ElementShortName">clk</obj_property>
      <obj_property name="ObjectShortName">clk</obj_property>
   </wvobject>
   <wvobject type="array" fp_name="/tb_top/sw">
      <obj_property name="ElementShortName">sw[7:0]</obj_property>
      <obj_property name="ObjectShortName">sw[7:0]</obj_property>
      <obj_property name="Radix">UNSIGNEDDECRADIX</obj_property>
   </wvobject>
   <!-- a comment -->
   <wvobject type="divider" fp_name="divider21">
      <obj_property name="label">My &amp; divider</obj_property>
      <obj_property name="DisplayName">label</obj_property>
   </wvobject>
   <marker time="500000" label="" />
</wave_config>
`;
  assert.deepEqual(readWcfg(isim), {
    tops: ['numeric_std', 'tb_top'],
    rows: [
      { kind: 'sig', path: '/tb_top/clk', name: 'clk', type: 'logic', radix: 'default', expanded: false },
      { kind: 'sig', path: '/tb_top/sw', name: 'sw[7:0]', type: 'array', radix: 'udec', expanded: false },
      { kind: 'div', name: 'My & divider' },
    ],
    markers: [500000],
  });
});

test('#1019 wcfgPath: a name typed for the file, as a path of the project', () => {
  assert.equal(wcfgPath('sim/tb_top.wcfg'), 'sim/tb_top.wcfg');
  assert.equal(wcfgPath('  my_waves '), 'my_waves.wcfg');
  assert.equal(wcfgPath('waves.WCFG'), 'waves.WCFG');
  assert.equal(wcfgPath('./sim/a-b.1'), 'sim/a-b.1.wcfg');
  assert.equal(wcfgPath('/sim\\tb.wcfg'), 'sim/tb.wcfg');
  for (const bad of ['', '   ', null, undefined, '../x', 'sim/../../x', 'a b', 'sim//x', '.hidden', 'x/.wcfg', 'a?b'])
    assert.equal(wcfgPath(bad), null, String(bad));
});

test('#1019 wcfgList: the project\'s configurations, the module\'s own first', () => {
  const files = ['src/top.vhd', 'z.wcfg', 'sim/tb_top.wcfg', 'a.wcfg', 'sim/TB_TOP.wcfg.bak', 'other/tb_top.WCFG'];
  assert.deepEqual(wcfgList(files, 'tb_top'), ['other/tb_top.WCFG', 'sim/tb_top.wcfg', 'a.wcfg', 'z.wcfg']);
  assert.deepEqual(wcfgList(files, 'top'), ['a.wcfg', 'other/tb_top.WCFG', 'sim/tb_top.wcfg', 'z.wcfg']);
  assert.deepEqual(wcfgList([], 'top'), []);
});

test('#1019 wcfg: what is not a wave configuration is refused', () => {
  assert.throws(() => readWcfg(''), /not a wave configuration/);
  assert.throws(() => readWcfg('{"rows": []}'), /not a wave configuration/);
  assert.throws(() => readWcfg('<?xml version="1.0"?><project><wvobject/></project>'), /not a wave configuration/);
  assert.throws(() => readWcfg('<wave_config><wvobject type="logic" fp_name="/a"></wave_config>'), /malformed XML: <\/wave_config> closes <wvobject>/);
  assert.throws(() => readWcfg('<wave_config><wvobject type="logic" fp_name="/a">'), /malformed XML: <wvobject> not closed/);
  assert.throws(() => readWcfg('<wave_config>< wvobject></wave_config>'), /malformed XML near/);
  // a marker with no time, or a negative one: left out
  assert.deepEqual(readWcfg('<wave_config><marker label="" /><marker time="-5" /><marker time="7" /></wave_config>').markers, [7]);
});

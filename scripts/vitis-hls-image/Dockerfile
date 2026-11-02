# The base of the Vitis HLS image (#1624): Ubuntu 22.04 (a release Vivado ML 2025 supports) with the libraries Vitis
# HLS's C simulation, synthesis and co-simulation (xsim) need. Vivado is installed into it afterwards, from AMD's
# installer, by install.sh (README.md): the installer needs the maintainer's AMD account, so it is not a build step.
# (the base pinned by its digest, as docker/ise's (#1435, #2645): a tag can be repointed; the digest is the manifest
# list's, which the platform selects from; Dependabot proposes a new one, .github/dependabot.yml)
FROM --platform=linux/amd64 ubuntu:22.04@sha256:076e7bf82319619f28dd0aa9c02ab34b055ad37100395b4f49a2ffba04fb5e11
ENV DEBIAN_FRONTEND=noninteractive LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
RUN apt-get update && apt-get install -y --no-install-recommends \
      locales ca-certificates bash coreutils findutils procps make gcc g++ libc6-dev \
      libtinfo5 libncurses5 libx11-6 libxext6 libxrender1 libxtst6 libxi6 libfreetype6 fontconfig \
      libgtk2.0-0 libsm6 libnss3 libasound2 libxss1 graphviz unzip xz-utils \
    && locale-gen en_US.UTF-8 && rm -rf /var/lib/apt/lists/*
WORKDIR /w

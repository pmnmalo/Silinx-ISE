# syntax=docker/dockerfile:1
#
# XAIlinx - Xilinx ISE 14.7 (WebPACK) command-line toolchain image, built from YOUR OWN copy of the
# official installer and license. The resulting image contains AMD/Xilinx software and your
# personal license: keep it private, never push it to a public registry.
#
# Build it with docker/ise/build-ise-image.sh (macOS/Linux) or build-ise-image.ps1 (Windows),
# which pass the installer and license folders as named build contexts:
#
#   docker build --platform linux/amd64 \
#     --build-context installer=<folder with Xilinx_ISE_DS_Lin_14.7_1015_1.tar> \
#     --build-context license=<folder with Xilinx.lic> \
#     -t xailinx/ise:14.7 docker/ise
#
# The installer tarball is bind-mounted during the install step, so its 6.5 GB never end up in
# an image layer. ISE 14.7 is x86-64 only: on Apple Silicon / ARM Linux the image runs under
# x86-64 emulation (Rosetta or QEMU).
# Base recipe: Ubuntu 14.04 + batchxsetup, as in gitlab.com/pmnmalo/xilinx-ise-in-docker-on-mac.

FROM --platform=linux/amd64 ubuntu:14.04 AS base
ENV DEBIAN_FRONTEND=noninteractive TERM=xterm-256color LANG=C.UTF-8
# Ubuntu 14.04 is end-of-life: fall back to old-releases if the main archive no longer serves it.
RUN apt-get update || { sed -i -E 's#http://(archive|security).ubuntu.com#http://old-releases.ubuntu.com#' /etc/apt/sources.list && apt-get update; }; \
    apt-get install -y --no-install-recommends \
      libncurses5 libx11-6 libsm6 libxi6 libxrender1 libxrandr2 libfreetype6 libfontconfig1 \
      libxm4 libxp6 libstdc++5 libstdc++6 libxpm4 libglib2.0-0 rpcbind gcc make ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS install
COPY install-config.txt /tmp/install-config.txt
RUN --mount=type=bind,from=installer,source=Xilinx_ISE_DS_Lin_14.7_1015_1.tar,target=/tmp/ise.tar \
    set -eu; \
    mkdir -p /tmp/ise-src; \
    tar -xf /tmp/ise.tar -C /tmp/ise-src; \
    cd /tmp/ise-src/Xilinx_ISE_DS_Lin_14.7_1015_1/bin/lin64; \
    yes | ./batchxsetup --batch /tmp/install-config.txt || true; \
    test -x /opt/Xilinx/14.7/ISE_DS/ISE/bin/lin64/xst; \
    rm -rf /tmp/ise-src

FROM base
COPY --from=install /opt/Xilinx /opt/Xilinx
# ISE ships an old libstdc++ that breaks some tools on newer kernels/libc: use the system one.
RUN set -eu; d=/opt/Xilinx/14.7/ISE_DS/ISE/lib/lin64; \
    for f in "$d"/libstdc++.so.6*; do if [ -e "$f" ]; then mv "$f" "$f.distrib"; fi; done; \
    ln -sf /usr/lib/x86_64-linux-gnu/libstdc++.so.6 "$d/libstdc++.so.6"; \
    [ -e /lib/x86_64-linux-gnu/libXp.so.6 ] || ln -s /usr/lib/x86_64-linux-gnu/libXpm.so.4 /lib/x86_64-linux-gnu/libXp.so.6; \
    rm /bin/sh && ln -s /bin/bash /bin/sh
COPY --from=license Xilinx.lic /opt/Xilinx/Xilinx.lic
COPY entrypoint.sh /usr/local/bin/xailinx-ise
RUN sed -i "s/\r$//" /usr/local/bin/xailinx-ise && chmod 0755 /usr/local/bin/xailinx-ise && chmod 0644 /opt/Xilinx/Xilinx.lic && mkdir -p /work && chmod 0777 /work
ENV XILINXD_LICENSE_FILE=/opt/Xilinx/Xilinx.lic LM_LICENSE_FILE=/opt/Xilinx/Xilinx.lic \
    ISE_SETTINGS=/opt/Xilinx/14.7/ISE_DS/settings64.sh
LABEL org.xailinx.ise="14.7" org.xailinx.settings="/opt/Xilinx/14.7/ISE_DS/settings64.sh" \
      org.opencontainers.image.description="Xilinx ISE 14.7 WebPACK for XAIlinx (private image: contains AMD/Xilinx software)"
WORKDIR /work
ENTRYPOINT ["/usr/local/bin/xailinx-ise"]
CMD ["bash"]

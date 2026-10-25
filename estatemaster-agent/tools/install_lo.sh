#!/usr/bin/env bash
# LibreOffice for CI (the referee of the engine sweep and the server-engine test), from the LibreOffice team's own Ubuntu archive
# (ppa:libreoffice/ppa: the newest stable release) instead of Ubuntu 24.04's 24.2, which lacks Excel's dynamic arrays (FILTER, SORT,
# UNIQUE, SEQUENCE), XLOOKUP and LET. Fails when what is installed is older than MIN, so the referee never silently drops back.
# Usage: tools/install_lo.sh <apt packages…>   (e.g. libreoffice-calc-nogui python3-uno)
set -euo pipefail
MIN="${LO_MIN:-25.2}"
sudo DEBIAN_FRONTEND=noninteractive add-apt-repository -y ppa:libreoffice/ppa >/dev/null
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "$@" >/dev/null
V=$(soffice --version | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)*' | head -1)
echo "LibreOffice $V"
if [ "$(printf '%s\n%s\n' "$MIN" "$V" | sort -V | head -1)" != "$MIN" ]; then echo "LibreOffice $V is older than $MIN: the referee would miss Excel functions"; exit 1; fi

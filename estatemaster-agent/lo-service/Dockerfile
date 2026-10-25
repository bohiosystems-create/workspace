# LibreOffice recalculation service (server.py). Debian 13 ships LibreOffice 25.2 (XLOOKUP, LET, FILTER, SORT, UNIQUE, SEQUENCE); a newer
# build is taken from trixie-backports when Debian has one there, else 25.2. GET /health reports the version (Settings → System check).
FROM debian:trixie-slim
RUN echo "deb http://deb.debian.org/debian trixie-backports main" > /etc/apt/sources.list.d/backports.list && apt-get update \
 && P="libreoffice-calc-nogui python3-uno fonts-dejavu-core fonts-liberation2 ca-certificates" \
 && (DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends -t trixie-backports $P \
     || DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $P) \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m lo
USER lo
WORKDIR /home/lo
COPY server.py .
ENV PORT=8080 PYTHONUNBUFFERED=1 HOME=/home/lo
EXPOSE 8080
CMD ["python3", "server.py"]

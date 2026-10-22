# LibreOffice recalculation service (server.py). Debian 13 ships LibreOffice 25.2 (XLOOKUP, LET, FILTER, SORT, UNIQUE, SEQUENCE).
FROM debian:trixie-slim
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      libreoffice-calc-nogui python3-uno fonts-dejavu-core fonts-liberation2 ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m lo
USER lo
WORKDIR /home/lo
COPY server.py .
ENV PORT=8080 PYTHONUNBUFFERED=1 HOME=/home/lo
EXPOSE 8080
CMD ["python3", "server.py"]

# Live version of the Kinan AI Assistant Director of Marketing (real AI answers, ElevenLabs voice, Outlook/CRM/Oracle
# integrations when configured). Build:  docker build -t kinan-director .
# Run:    docker run -d --name kinan -p 3000:3000 --env-file .env -v kinan-data:/data kinan-director
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3000 DATABASE_URL=file:/data/kinan.db
VOLUME /data
EXPOSE 3000
# Creates / updates the SQLite database on start, then serves the app.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx next start -p ${PORT}"]

FROM node:20-alpine

RUN apk add --no-cache wget

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
ENV UPLOAD_DIR=/data/uploads
ENV DATA_DIR=/data/app

RUN mkdir -p /data/uploads /data/app && chown -R node:node /data

USER node

EXPOSE 3000

CMD ["node", "src/server.js"]

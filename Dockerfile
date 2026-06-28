# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund --include=optional

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV UPLOAD_DIR=/app/uploads

COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund --include=optional --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY serve.mjs migrate.mjs ./

RUN mkdir -p /app/uploads

EXPOSE 3000
CMD ["sh", "-c", "node migrate.mjs && node serve.mjs"]

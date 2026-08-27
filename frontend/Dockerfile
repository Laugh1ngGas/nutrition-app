FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Render auto-translates its dashboard/render.yaml env vars into Docker build
# args, but only for names declared here — without this ARG, BACKEND_HOST is
# invisible to `npm run build` even though it's set on the service.
ARG BACKEND_HOST
ENV BACKEND_HOST=$BACKEND_HOST

COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=builder /app/.output ./.output
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

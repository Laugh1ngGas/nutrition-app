FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

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

FROM node:20-alpine AS builder

WORKDIR /app
COPY api/package*.json ./
RUN npm ci --only=production && npm ci

COPY api/ .
RUN npm run build

# Production image
FROM node:20-alpine AS runner

RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy production deps
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
EXPOSE 3000

USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]

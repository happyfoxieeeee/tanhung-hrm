# TAN HUNG HRM — chạy trên VPS / Docker (không cần cài thư viện npm)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY . .
RUN node scripts/build-web.js && addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["sh", "-c", "node scripts/migrate.js && node server/index.js"]

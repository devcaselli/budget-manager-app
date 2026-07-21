# Stage 1: build the Angular app in production mode.
FROM node:22-alpine AS build

WORKDIR /app

# Cache deps: only re-run npm ci when the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Uses environment.prod.ts via the production configuration.
RUN npm run build

# Stage 2: serve the static bundle with nginx.
FROM nginx:alpine

# @angular/build:application emits to dist/<project>/browser.
COPY --from=build /app/dist/budget-manager-app/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

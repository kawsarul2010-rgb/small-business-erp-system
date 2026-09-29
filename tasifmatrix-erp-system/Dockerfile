# ---------------------------------------------------------------------------
# Tasif Matrix ERP - single container: ASP.NET Core API + Angular SPA (wwwroot)
# Build locally:  docker build -t tasifmatrix-erp .
# ---------------------------------------------------------------------------

# 1) Build the Angular app
# Debian rather than Alpine: the lock file pins the glibc builds of the native
# tooling (esbuild, lmdb), and musl has no matching binaries for some of them.
FROM node:24-slim AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build -- --configuration production

# 2) Build and publish the .NET API
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src/backend
COPY backend/Directory.Build.props ./
COPY backend/src/Sompriti.Erp.Domain/Sompriti.Erp.Domain.csproj src/Sompriti.Erp.Domain/
COPY backend/src/Sompriti.Erp.Application/Sompriti.Erp.Application.csproj src/Sompriti.Erp.Application/
COPY backend/src/Sompriti.Erp.Infrastructure/Sompriti.Erp.Infrastructure.csproj src/Sompriti.Erp.Infrastructure/
COPY backend/src/Sompriti.Erp.Api/Sompriti.Erp.Api.csproj src/Sompriti.Erp.Api/
RUN dotnet restore src/Sompriti.Erp.Api/Sompriti.Erp.Api.csproj
COPY backend/ ./
RUN dotnet publish src/Sompriti.Erp.Api/Sompriti.Erp.Api.csproj -c Release -o /app --no-restore

# 3) Runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_RUNNING_IN_CONTAINER=true \
    PORT=8080
COPY --from=api /app ./
COPY --from=web /src/frontend/dist/frontend ./wwwroot
EXPOSE 8080
USER app
ENTRYPOINT ["dotnet", "Sompriti.Erp.Api.dll"]

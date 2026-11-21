# ClipStream Architecture Diagrams

This directory contains architecture documentation and diagrams for the ClipStream platform.

## Planned Diagrams for Coursework Report

1. **Logical Architecture Diagram (`logical-architecture.png`):**
   - End-to-end request flow: Client Browser -> Azure Front Door / CDN -> Azure Container Apps (Replicas) -> Azure Blob Storage / Cosmos DB / AI Services.

2. **Storage Abstraction & Adapter Pattern (`adapter-pattern.png`):**
   - Factory pattern illustrating `createServices()` switching between local adapters (`localMediaStore`, `localMetadataStore`, `localSentiment`, `localTranscription`) and cloud adapters (`azureBlobMediaStore`, `cosmosMetadataStore`, `azureLanguageSentiment`, `azureSpeechTranscription`).

3. **Data Model & Partitioning Scheme (`data-partitioning.png`):**
   - Cosmos DB containers (`videos` partitioned by `/id`, `comments` partitioned by `/videoId`, `likes` partitioned by `/videoId`).

4. **CI/CD Pipeline Flow (`cicd-pipeline.png`):**
   - GitHub Actions workflow: push -> lint -> unit tests with coverage -> docker build -> ACR publish -> Container Apps deployment.


# repojavi

## Integración Claude Code ↔ n8n (self-hosted)

Este proyecto conecta Claude Code con una instancia self-hosted de n8n mediante el protocolo MCP (Model Context Protocol).

### Configuración

El archivo `.claude/settings.json` contiene la configuración del servidor MCP apuntando a la instancia n8n:

```
http://186.123.181.61:5678/mcp-server/http
```

### Requisitos en n8n

1. Crear un workflow con el nodo **MCP Server Trigger**
2. Asegurarse de que el workflow esté **activo**
3. El endpoint de transporte debe ser **HTTP** (Streamable HTTP)

### Uso

Al abrir este proyecto con Claude Code, el servidor MCP de n8n estará disponible automáticamente. Las herramientas (tools) que definas en n8n aparecerán como capacidades adicionales de Claude.

import { Injectable, Logger } from '@nestjs/common';

/**
 * Tool definition exposed to the frontend. Keeps the list of known
 * Stirling PDF endpoints in one place so the controller can validate
 * the requested tool before proxying the call.
 */
export interface StirlingTool {
  id: string;
  label: string;
  endpoint: string;
  description: string;
}

export interface StirlingToolsByCategory {
  organize: StirlingTool[];
  convert: StirlingTool[];
  security: StirlingTool[];
  ocr: StirlingTool[];
  optimize: StirlingTool[];
}

export interface StirlingHealth {
  ok: boolean;
  version?: string;
  message: string;
}

export interface StirlingProxyResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

/**
 * Service wrapping the self-hosted Stirling PDF REST API.
 *
 * The intranet never bundles Stirling directly: this service is a thin
 * proxy used by `StirlingController` to call the remote container
 * (whose URL and availability come from env vars).
 */
@Injectable()
export class StirlingService {
  private readonly logger = new Logger(StirlingService.name);
  private readonly baseUrl: string;
  private readonly publicUrl: string;
  private readonly enabled: boolean;

  constructor() {
    // baseUrl  = appelée par le backend (serveur-à-serveur), typiquement localhost
    // publicUrl = URL vue par le navigateur (sous-domaine HTTPS derrière BunkerWeb)
    this.baseUrl = process.env.STIRLING_PDF_URL || 'http://localhost:8080';
    this.publicUrl = process.env.STIRLING_PDF_PUBLIC_URL || this.baseUrl;
    this.enabled = process.env.STIRLING_PDF_ENABLED === 'true';
    if (this.enabled) {
      this.logger.log(`Stirling PDF enabled (internal: ${this.baseUrl}, public: ${this.publicUrl})`);
    } else {
      this.logger.log('Stirling PDF integration disabled (STIRLING_PDF_ENABLED!=true)');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getPublicUrl(): string {
    return this.publicUrl;
  }

  /**
   * Ping Stirling's status endpoint. Returns a sanitized result that is
   * safe to expose to the frontend (never throws).
   */
  async healthCheck(): Promise<StirlingHealth> {
    if (!this.enabled) {
      return {
        ok: false,
        message: 'Stirling PDF desactive (STIRLING_PDF_ENABLED!=true)',
      };
    }
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/info/status`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        return { ok: false, message: `HTTP ${response.status}` };
      }
      const data: any = await response.json().catch(() => ({}));
      return {
        ok: true,
        version: data?.version,
        message: 'Stirling PDF en ligne',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Stirling healthcheck failed: ${message}`);
      return { ok: false, message };
    }
  }

  /**
   * Returns the curated list of Stirling tools exposed by the intranet,
   * grouped in categories so the UI can render tabs/cards.
   *
   * Endpoints are the ones documented by the upstream Stirling-Tools
   * project (api/v1/...). The intranet only whitelists a subset; adding
   * a new one here is enough to make it available on the frontend.
   */
  getAvailableTools(): StirlingToolsByCategory {
    return {
      organize: [
        { id: 'merge-pdfs', label: 'Fusionner des PDF', endpoint: '/api/v1/general/merge-pdfs', description: 'Combiner plusieurs PDF en un seul fichier' },
        { id: 'split-pdf-by-pages', label: 'Diviser un PDF', endpoint: '/api/v1/general/split-pdf-by-pages', description: 'Separer un PDF en plusieurs fichiers selon les pages' },
        { id: 'rotate-pdf', label: 'Faire pivoter', endpoint: '/api/v1/general/rotate-pdf', description: "Pivoter les pages d'un PDF" },
        { id: 'remove-pages', label: 'Supprimer des pages', endpoint: '/api/v1/general/remove-pages', description: 'Retirer une ou plusieurs pages' },
      ],
      convert: [
        { id: 'pdf-to-img', label: 'PDF vers Image', endpoint: '/api/v1/convert/pdf/img', description: 'Extraire les pages en PNG/JPG' },
        { id: 'img-to-pdf', label: 'Image vers PDF', endpoint: '/api/v1/convert/img/pdf', description: 'Convertir une ou plusieurs images en PDF' },
        { id: 'pdf-to-word', label: 'PDF vers Word', endpoint: '/api/v1/convert/pdf/word', description: 'Conversion PDF -> DOCX' },
        { id: 'word-to-pdf', label: 'Word vers PDF', endpoint: '/api/v1/convert/file/pdf', description: 'Conversion DOCX -> PDF' },
      ],
      security: [
        { id: 'add-password', label: 'Proteger par mot de passe', endpoint: '/api/v1/security/add-password', description: 'Chiffrer un PDF (ISO 27001 A.5.12)' },
        { id: 'remove-password', label: 'Retirer le mot de passe', endpoint: '/api/v1/security/remove-password', description: 'Decoder un PDF protege (avec le mdp)' },
        { id: 'sanitize-pdf', label: 'Nettoyer un PDF', endpoint: '/api/v1/security/sanitize-pdf', description: 'Retirer JS, formulaires actifs et liens externes' },
        { id: 'add-watermark', label: 'Ajouter un filigrane', endpoint: '/api/v1/security/add-watermark', description: 'Marquage visuel (utile pour CONFIDENTIEL)' },
      ],
      ocr: [
        { id: 'ocr-pdf', label: 'OCR (texte recherchable)', endpoint: '/api/v1/misc/ocr-pdf', description: 'Reconnaissance optique : rendre un scan recherchable' },
        { id: 'extract-images', label: 'Extraire les images', endpoint: '/api/v1/misc/extract-images', description: "Sortir toutes les images d'un PDF" },
      ],
      optimize: [
        { id: 'compress-pdf', label: 'Compresser', endpoint: '/api/v1/misc/compress-pdf', description: "Reduire la taille d'un PDF" },
        { id: 'repair', label: 'Reparer', endpoint: '/api/v1/misc/repair', description: 'Tenter de reparer un PDF corrompu' },
      ],
    };
  }

  /**
   * Returns the flat list of known tool definitions. Convenient for the
   * controller when it needs to look up a tool by id.
   */
  findToolById(toolId: string): StirlingTool | undefined {
    const tools = this.getAvailableTools();
    const categories: StirlingTool[][] = [
      tools.organize,
      tools.convert,
      tools.security,
      tools.ocr,
      tools.optimize,
    ];
    for (const category of categories) {
      const match = category.find((tool) => tool.id === toolId);
      if (match) return match;
    }
    return undefined;
  }

  /**
   * Forwards a multipart request to Stirling and returns the raw response
   * body (buffer + headers we care about). The caller is responsible for
   * streaming it back to the HTTP client.
   *
   * Uses Node 18+ global `fetch`, `FormData` and `Blob` (no external dep).
   */
  async proxyToolCall(
    toolEndpoint: string,
    formData: FormData,
  ): Promise<StirlingProxyResult> {
    if (!this.enabled) {
      throw new Error('Stirling PDF desactive');
    }
    const url = `${this.baseUrl}${toolEndpoint}`;
    this.logger.debug(`Proxying Stirling tool call -> ${url}`);
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(120_000), // 2 min max per operation
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(
        `Stirling error ${response.status}: ${errText.slice(0, 200)}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType =
      response.headers.get('content-type') || 'application/octet-stream';
    const disposition = response.headers.get('content-disposition') || '';
    const filenameMatch = disposition.match(/filename="?([^";]+)"?/);
    const filename = filenameMatch?.[1] || 'output.pdf';
    return { buffer, contentType, filename };
  }
}

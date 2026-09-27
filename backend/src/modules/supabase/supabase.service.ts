import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface PwfReferenceCaseDbRecord {
  id: string;
  name: string;
  size_bytes: number;
  sha256: string;
  uploaded_at: string;
  status: string;
  anarede_version?: string;
  compatibility?: string;
  encoding?: string;
  line_ending?: string;
  title?: string;
  study_year?: number;
  bus_count?: number;
  generator_bus_count?: number;
  generator_group_count?: number;
  storage_path?: string;
  warnings?: string[];
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private client: SupabaseClient | null = null;
  private bucket: string = 'pwf';

  onModuleInit(): void {
    let url = process.env.SUPABASE_URL?.trim();
    if (!url && process.env.SUPABASE_PROJECT_ID) {
      url = `https://${process.env.SUPABASE_PROJECT_ID.trim()}.supabase.co`;
    } else if (
      url &&
      !url.startsWith('http://') &&
      !url.startsWith('https://')
    ) {
      url = `https://${url}.supabase.co`;
    }

    const key =
      process.env.SUPABASE_KEY?.trim() ??
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
      process.env.SUPABASE_ANON_KEY?.trim();
    this.bucket = process.env.SUPABASE_BUCKET?.trim() ?? 'pwf';

    if (url && key) {
      try {
        this.client = createClient(url, key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        });
        this.logger.log(
          `Supabase conectado com sucesso. Bucket configurado: "${this.bucket}".`,
        );
      } catch (error) {
        this.logger.error('Falha ao inicializar cliente Supabase:', error);
        this.client = null;
      }
    } else {
      this.logger.warn(
        'Variáveis SUPABASE_URL e/ou SUPABASE_KEY não encontradas. Operando com armazenamento local de fallback.',
      );
    }
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  getBucketName(): string {
    return this.bucket;
  }

  getClient(): SupabaseClient | null {
    return this.client;
  }

  /**
   * Envia um arquivo para o bucket do Supabase Storage.
   */
  async uploadFile(
    path: string,
    content: Buffer | string,
    contentType = 'application/octet-stream',
  ): Promise<{ path: string }> {
    if (!this.client) {
      throw new Error('Supabase client não configurado.');
    }

    const { data, error } = await this.client.storage
      .from(this.bucket)
      .upload(path, content, {
        contentType,
        upsert: true,
      });

    if (error) {
      this.logger.error(
        `Erro ao fazer upload para Supabase (${this.bucket}/${path}): ${error.message}`,
      );
      throw new Error(
        `Erro ao enviar arquivo para o Supabase: ${error.message}`,
      );
    }

    return { path: data.path };
  }

  /**
   * Baixa um arquivo do bucket do Supabase Storage como Buffer.
   */
  async downloadFile(path: string): Promise<Buffer | null> {
    if (!this.client) {
      return null;
    }

    const { data, error } = await this.client.storage
      .from(this.bucket)
      .download(path);

    if (error || !data) {
      this.logger.warn(
        `Arquivo não encontrado no Supabase (${this.bucket}/${path}): ${error?.message}`,
      );
      return null;
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Lista os nomes diretamente abaixo de uma pasta do bucket.
   * O Storage representa subpastas como entradas sem `id`; não dependemos
   * desse detalhe e devolvemos somente os nomes informados pela API.
   */
  async listFolder(path: string): Promise<string[] | null> {
    if (!this.client) {
      return null;
    }

    const { data, error } = await this.client.storage
      .from(this.bucket)
      .list(path, {
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (error) {
      this.logger.warn(
        `Não foi possível listar a pasta no Supabase (${this.bucket}/${path}): ${error.message}`,
      );
      return null;
    }

    return data.map((entry) => entry.name);
  }

  /**
   * Retorna a URL pública do arquivo no bucket (caso o bucket seja público).
   */
  getPublicUrl(path: string): string | null {
    if (!this.client) return null;
    const { data } = this.client.storage.from(this.bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  /**
   * Salva os metadados do caso de referência na tabela `pwf_reference_cases` do Supabase Postgres, se existir.
   */
  async saveReferenceCaseRecord(
    record: PwfReferenceCaseDbRecord,
  ): Promise<void> {
    if (!this.client) return;

    try {
      const { error } = await this.client
        .from('pwf_reference_cases')
        .upsert(record, { onConflict: 'id' });

      if (error) {
        this.logger.warn(
          `Não foi possível registrar o caso no Postgres do Supabase (tabela pwf_reference_cases): ${error.message}. ` +
            `O arquivo continua salvo com sucesso no bucket do Storage.`,
        );
      } else {
        this.logger.log(
          `Metadados do caso ${record.id} sincronizados na tabela pwf_reference_cases.`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Exceção ao tentar salvar metadados no Supabase DB: ${(err as Error).message}`,
      );
    }
  }
}

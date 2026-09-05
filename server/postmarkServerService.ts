// Use the native fetch API available in Node.js 18+

export interface PostmarkServerConfig {
  name: string;
  color?: string;
  trackOpens?: boolean;
  trackLinks?: 'None' | 'HtmlAndText' | 'HtmlOnly' | 'TextOnly';
}

export interface PostmarkServer {
  ID: number;
  Name: string;
  ApiTokens: string[];
  Color: string;
  SmtpApiActivated: boolean;
  RawEmailEnabled: boolean;
  DeliveryType: string;
  ServerLink: string;
  InboundAddress: string;
  InboundHash: string;
  TrackOpens: boolean;
  TrackLinks: string;
}

export interface PostmarkServerResult {
  success: boolean;
  server?: PostmarkServer;
  error?: string;
}

class PostmarkServerService {
  private readonly accountToken: string;
  private readonly baseUrl = 'https://api.postmarkapp.com';

  constructor() {
    // Account token will be validated at server startup, not module load
    // This allows Docker build to succeed without runtime env vars
    this.accountToken = process.env.POSTMARK_ACCOUNT_TOKEN || 'will-be-validated-at-startup';
  }

  async createServer(config: PostmarkServerConfig): Promise<PostmarkServerResult> {
    try {
      const response = await fetch(`${this.baseUrl}/servers`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Account-Token': this.accountToken,
        },
        body: JSON.stringify({
          Name: config.name,
          Color: config.color || 'Purple',
          TrackOpens: config.trackOpens || true,
          TrackLinks: config.trackLinks || 'HtmlAndText',
        }),
      });

      if (!response.ok) {
        await response.text();
        console.error('Postmark server creation failed:', response.status);
        
        return {
          success: false,
          error: `Failed to create Postmark server: HTTP ${response.status}`
        };
      }

      const server = await response.json() as PostmarkServer;
      
      return {
        success: true,
        server
      };
    } catch (error) {
      console.error('Error creating Postmark server:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async findServerByName(name: string): Promise<PostmarkServerResult> {
    try {
      const response = await fetch(`${this.baseUrl}/servers?count=500&offset=0`, {
        headers: { 'Accept': 'application/json', 'X-Postmark-Account-Token': this.accountToken },
      });
      if (!response.ok) return { success: false, error: `Failed to list Postmark servers: ${response.status}` };
      const data = await response.json() as { Servers?: PostmarkServer[] };
      const summary = (data.Servers || []).find(server => server.Name === name);
      if (!summary) return { success: true };

      // The list endpoint may omit ApiTokens. Always load the full server
      // record before treating a deterministic-name match as reusable.
      return this.getServer(summary.ID);
    } catch (error) {
      console.error('Error listing Postmark servers:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' };
    }
  }

  async getServer(serverId: number): Promise<PostmarkServerResult> {
    try {
      const response = await fetch(`${this.baseUrl}/servers/${serverId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Postmark-Account-Token': this.accountToken,
        },
      });

      if (!response.ok) {
        await response.text();
        return {
          success: false,
          error: `Failed to get Postmark server: HTTP ${response.status}`
        };
      }

      const server = await response.json() as PostmarkServer;
      
      return {
        success: true,
        server
      };
    } catch (error) {
      console.error('Error getting Postmark server:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async deleteServer(serverId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/servers/${serverId}`, {
        method: 'DELETE',
        headers: {
          'X-Postmark-Account-Token': this.accountToken,
        },
      });

      if (!response.ok) {
        await response.text();
        if (response.status === 404) return { success: true };
        return {
          success: false,
          error: `Failed to delete Postmark server: HTTP ${response.status}`
        };
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting Postmark server:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error occurred'
      };
    }
  }

  async testConnection(): Promise<{ success: boolean; serverCount?: number; error?: string }> {
    
    try {
      const response = await fetch(`${this.baseUrl}/servers`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Postmark-Account-Token': this.accountToken,
        },
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Postmark connection test failed:', response.status, errorData);
        return {
          success: false,
          error: `Connection failed: ${response.status} - ${errorData}`
        };
      }

      const data = await response.json();
      const servers = Array.isArray(data.Servers) ? data.Servers : [];
      
      return {
        success: true,
        serverCount: servers.length
      };
    } catch (error) {
      console.error('Error testing Postmark connection:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}

export const postmarkServerService = new PostmarkServerService();
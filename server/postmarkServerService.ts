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
  private readonly accountToken: string | null;
  private readonly baseUrl = 'https://api.postmarkapp.com';

  constructor() {
    this.accountToken = process.env.POSTMARK_ACCOUNT_TOKEN || null;
    
    if (!this.accountToken) {
      console.warn('WARNING: POSTMARK_ACCOUNT_TOKEN not set - Postmark features will be disabled');
    }
  }

  private checkToken(): boolean {
    if (!this.accountToken) {
      console.error('Postmark operation attempted but POSTMARK_ACCOUNT_TOKEN is not configured');
      return false;
    }
    return true;
  }

  async createServer(config: PostmarkServerConfig): Promise<PostmarkServerResult> {
    if (!this.checkToken()) {
      return { success: false, error: 'POSTMARK_ACCOUNT_TOKEN not configured' };
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/servers`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Account-Token': this.accountToken!,
        },
        body: JSON.stringify({
          Name: config.name,
          Color: config.color || 'Purple',
          TrackOpens: config.trackOpens || true,
          TrackLinks: config.trackLinks || 'HtmlAndText',
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Postmark server creation failed:', response.status, errorData);
        
        return {
          success: false,
          error: `Failed to create Postmark server: ${response.status} ${errorData}`
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

  async getServer(serverId: number): Promise<PostmarkServerResult> {
    if (!this.checkToken()) {
      return { success: false, error: 'POSTMARK_ACCOUNT_TOKEN not configured' };
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/servers/${serverId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Postmark-Account-Token': this.accountToken!,
        },
      });

      if (!response.ok) {
        const errorData = await response.text();
        return {
          success: false,
          error: `Failed to get Postmark server: ${response.status} ${errorData}`
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
    if (!this.checkToken()) {
      return { success: false, error: 'POSTMARK_ACCOUNT_TOKEN not configured' };
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/servers/${serverId}`, {
        method: 'DELETE',
        headers: {
          'X-Postmark-Account-Token': this.accountToken!,
        },
      });

      if (!response.ok) {
        const errorData = await response.text();
        return {
          success: false,
          error: `Failed to delete Postmark server: ${response.status} ${errorData}`
        };
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting Postmark server:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async testConnection(): Promise<{ success: boolean; serverCount?: number; error?: string }> {
    if (!this.checkToken()) {
      return { success: false, error: 'POSTMARK_ACCOUNT_TOKEN not configured' };
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/servers`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Postmark-Account-Token': this.accountToken!,
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
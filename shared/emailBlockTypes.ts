// Email block types for drag-and-drop builder

export type EmailBlockType = 
  | 'text' 
  | 'heading' 
  | 'button' 
  | 'account-details' 
  | 'image' 
  | 'divider'
  | 'spacer';

export interface BaseEmailBlock {
  id: string;
  type: EmailBlockType;
  position: number; // Order in the email
}

export interface TextBlock extends BaseEmailBlock {
  type: 'text';
  content: string; // HTML content supporting rich text and bullets
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
  padding?: string;
}

export interface HeadingBlock extends BaseEmailBlock {
  type: 'heading';
  content: string;
  level?: 1 | 2 | 3; // h1, h2, h3
  textAlign?: 'left' | 'center' | 'right';
  color?: string;
}

export interface ButtonBlock extends BaseEmailBlock {
  type: 'button';
  text: string;
  url: string; // Can be variable like {{consumerPortalLink}} or actual URL
  backgroundColor?: string;
  textColor?: string;
  align?: 'left' | 'center' | 'right';
  borderRadius?: number;
  padding?: string;
}

export interface AccountDetailsField {
  label: string;
  variable: string; // e.g., "accountNumber", "creditor", "balance"
  show: boolean; // Conditional visibility
}

export interface AccountDetailsBlock extends BaseEmailBlock {
  type: 'account-details';
  title?: string;
  fields: AccountDetailsField[];
  borderColor?: string;
  backgroundColor?: string;
  padding?: string;
}

export interface ImageBlock extends BaseEmailBlock {
  type: 'image';
  src: string; // Can be variable like {{COMPANY_LOGO}} or actual URL
  alt?: string;
  width?: number | string;
  height?: number | string;
  align?: 'left' | 'center' | 'right';
}

export interface DividerBlock extends BaseEmailBlock {
  type: 'divider';
  color?: string;
  thickness?: number;
  margin?: string;
}

export interface SpacerBlock extends BaseEmailBlock {
  type: 'spacer';
  height: number; // Height in pixels
}

export type EmailBlock =
  | TextBlock
  | HeadingBlock
  | ButtonBlock
  | AccountDetailsBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock;

export interface EmailTemplate {
  blocks: EmailBlock[];
}

// Default block templates
export const defaultBlocks = {
  text: (): TextBlock => ({
    id: crypto.randomUUID(),
    type: 'text',
    content: '<p>Enter your text here...</p>',
    position: 0,
    fontSize: 14,
    textAlign: 'left',
    padding: '10px 0',
  }),
  heading: (): HeadingBlock => ({
    id: crypto.randomUUID(),
    type: 'heading',
    content: 'Heading',
    level: 2,
    position: 0,
    textAlign: 'center',
  }),
  button: (): ButtonBlock => ({
    id: crypto.randomUUID(),
    type: 'button',
    text: 'View Portal',
    url: '{{consumerPortalLink}}',
    position: 0,
    backgroundColor: '#3869D4',
    textColor: '#ffffff',
    align: 'center',
    borderRadius: 4,
    padding: '12px 24px',
  }),
  accountDetails: (): AccountDetailsBlock => ({
    id: crypto.randomUUID(),
    type: 'account-details',
    title: 'Account Information',
    position: 0,
    fields: [
      { label: 'Account Number', variable: '{{accountNumber}}', show: true },
      { label: 'Creditor', variable: '{{creditor}}', show: true },
      { label: 'Balance', variable: '{{balance}}', show: true },
      { label: 'Due Date', variable: '{{dueDate}}', show: true },
    ],
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    padding: '16px',
  }),
  image: (): ImageBlock => ({
    id: crypto.randomUUID(),
    type: 'image',
    src: '{{COMPANY_LOGO}}',
    alt: 'Company Logo',
    position: 0,
    width: '200px',
    align: 'center',
  }),
  divider: (): DividerBlock => ({
    id: crypto.randomUUID(),
    type: 'divider',
    position: 0,
    color: '#e5e7eb',
    thickness: 1,
    margin: '20px 0',
  }),
  spacer: (): SpacerBlock => ({
    id: crypto.randomUUID(),
    type: 'spacer',
    position: 0,
    height: 30,
  }),
};

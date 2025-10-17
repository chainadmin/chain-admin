import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { 
  Type, 
  Heading1, 
  MousePointer2, 
  CreditCard, 
  Image as ImageIcon, 
  Minus, 
  Space,
  Trash2,
  GripVertical,
  Plus,
  List,
  ListOrdered
} from 'lucide-react';
import type { EmailBlock, EmailBlockType } from '@shared/emailBlockTypes';
import { defaultBlocks } from '@shared/emailBlockTypes';

interface EmailBuilderProps {
  initialBlocks?: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
}

export function EmailBuilder({ initialBlocks = [], onChange }: EmailBuilderProps) {
  const [blocks, setBlocks] = useState<EmailBlock[]>(initialBlocks);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const selectedBlock = blocks.find(b => b.id === selectedBlockId);

  const addBlock = (type: EmailBlockType) => {
    const blockKey = type === 'account-details' ? 'accountDetails' : type;
    const newBlock = { ...defaultBlocks[blockKey as keyof typeof defaultBlocks](), position: blocks.length };
    const updatedBlocks = [...blocks, newBlock as EmailBlock];
    setBlocks(updatedBlocks);
    onChange(updatedBlocks);
    setSelectedBlockId(newBlock.id);
  };

  const updateBlock = (id: string, updates: Partial<EmailBlock>) => {
    const updatedBlocks = blocks.map(b => 
      b.id === id ? { ...b, ...updates } : b
    );
    setBlocks(updatedBlocks);
    onChange(updatedBlocks);
  };

  const deleteBlock = (id: string) => {
    const updatedBlocks = blocks.filter(b => b.id !== id).map((b, idx) => ({ ...b, position: idx }));
    setBlocks(updatedBlocks);
    onChange(updatedBlocks);
    setSelectedBlockId(null);
  };

  const moveBlock = (fromIndex: number, toIndex: number) => {
    const updated = [...blocks];
    const [movedBlock] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, movedBlock);
    const reordered = updated.map((b, idx) => ({ ...b, position: idx }));
    setBlocks(reordered);
    onChange(reordered);
  };

  const handleDragStart = (e: React.DragEvent, blockId: string) => {
    setDraggedBlockId(blockId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetBlockId: string) => {
    e.preventDefault();
    if (!draggedBlockId || draggedBlockId === targetBlockId) return;

    const fromIndex = blocks.findIndex(b => b.id === draggedBlockId);
    const toIndex = blocks.findIndex(b => b.id === targetBlockId);
    
    moveBlock(fromIndex, toIndex);
    setDraggedBlockId(null);
  };

  const renderBlockPreview = (block: EmailBlock) => {
    switch (block.type) {
      case 'text':
        return (
          <div 
            style={{ 
              fontSize: block.fontSize || 14,
              textAlign: block.textAlign || 'left',
              color: block.color || '#000',
              padding: block.padding || '10px 0'
            }}
            dangerouslySetInnerHTML={{ __html: block.content || '<p>Empty text block</p>' }}
          />
        );
      
      case 'heading':
        const HeadingTag = `h${block.level || 2}` as keyof JSX.IntrinsicElements;
        return (
          <HeadingTag style={{ 
            textAlign: block.textAlign || 'center',
            color: block.color || '#000',
            margin: '10px 0'
          }}>
            {block.content || 'Empty heading'}
          </HeadingTag>
        );
      
      case 'button':
        return (
          <div style={{ textAlign: block.align || 'center', padding: '10px 0' }}>
            <button style={{
              backgroundColor: block.backgroundColor || '#3869D4',
              color: block.textColor || '#ffffff',
              borderRadius: `${block.borderRadius || 4}px`,
              padding: block.padding || '12px 24px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}>
              {block.text || 'Button'}
            </button>
          </div>
        );
      
      case 'account-details':
        return (
          <div style={{
            border: `1px solid ${block.borderColor || '#e5e7eb'}`,
            backgroundColor: block.backgroundColor || '#f9fafb',
            padding: block.padding || '16px',
            borderRadius: '4px',
            margin: '10px 0'
          }}>
            {block.title && <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>{block.title}</h3>}
            {block.fields.filter(f => f.show).map((field, idx) => (
              <div key={idx} style={{ padding: '4px 0', display: 'flex', gap: '8px' }}>
                <strong>{field.label}:</strong> <span>{field.variable}</span>
              </div>
            ))}
          </div>
        );
      
      case 'image':
        return (
          <div style={{ textAlign: block.align || 'center', padding: '10px 0' }}>
            <img 
              src={block.src === '{{COMPANY_LOGO}}' ? 'https://via.placeholder.com/200x80?text=Logo' : block.src}
              alt={block.alt || 'Image'}
              style={{ 
                width: block.width || 'auto',
                height: block.height || 'auto',
                maxWidth: '100%'
              }}
            />
          </div>
        );
      
      case 'divider':
        return (
          <hr style={{
            border: 'none',
            borderTop: `${block.thickness || 1}px solid ${block.color || '#e5e7eb'}`,
            margin: block.margin || '20px 0'
          }} />
        );
      
      case 'spacer':
        return <div style={{ height: `${block.height}px` }} />;
      
      default:
        return null;
    }
  };

  const renderBlockEditor = () => {
    if (!selectedBlock) {
      return (
        <div className="p-6 text-center text-muted-foreground">
          Select a block to edit its properties
        </div>
      );
    }

    switch (selectedBlock.type) {
      case 'text':
        return (
          <div className="space-y-4">
            <div>
              <Label>Content</Label>
              <Textarea
                value={selectedBlock.content}
                onChange={(e) => updateBlock(selectedBlock.id, { content: e.target.value })}
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Supports HTML: use &lt;ul&gt;&lt;li&gt; for bullets, &lt;ol&gt;&lt;li&gt; for numbers
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Font Size (px)</Label>
                <Input
                  type="number"
                  value={selectedBlock.fontSize || 14}
                  onChange={(e) => updateBlock(selectedBlock.id, { fontSize: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <Label>Text Align</Label>
                <Select 
                  value={selectedBlock.textAlign || 'left'}
                  onValueChange={(value) => updateBlock(selectedBlock.id, { textAlign: value as 'left' | 'center' | 'right' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Text Color</Label>
              <Input
                type="color"
                value={selectedBlock.color || '#000000'}
                onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })}
              />
            </div>
          </div>
        );

      case 'heading':
        return (
          <div className="space-y-4">
            <div>
              <Label>Heading Text</Label>
              <Input
                value={selectedBlock.content}
                onChange={(e) => updateBlock(selectedBlock.id, { content: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Level</Label>
                <Select 
                  value={String(selectedBlock.level || 2)}
                  onValueChange={(value) => updateBlock(selectedBlock.id, { level: parseInt(value) as 1 | 2 | 3 })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">H1 (Largest)</SelectItem>
                    <SelectItem value="2">H2</SelectItem>
                    <SelectItem value="3">H3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Text Align</Label>
                <Select 
                  value={selectedBlock.textAlign || 'center'}
                  onValueChange={(value) => updateBlock(selectedBlock.id, { textAlign: value as 'left' | 'center' | 'right' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Color</Label>
              <Input
                type="color"
                value={selectedBlock.color || '#000000'}
                onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })}
              />
            </div>
          </div>
        );

      case 'button':
        return (
          <div className="space-y-4">
            <div>
              <Label>Button Text</Label>
              <Input
                value={selectedBlock.text}
                onChange={(e) => updateBlock(selectedBlock.id, { text: e.target.value })}
              />
            </div>
            <div>
              <Label>Button URL</Label>
              <Input
                value={selectedBlock.url}
                onChange={(e) => updateBlock(selectedBlock.id, { url: e.target.value })}
                placeholder="https://example.com or {{consumerPortalLink}}"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {'{'}{'{'} consumerPortalLink {'}'}{'}'} for portal URL
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Background Color</Label>
                <Input
                  type="color"
                  value={selectedBlock.backgroundColor || '#3869D4'}
                  onChange={(e) => updateBlock(selectedBlock.id, { backgroundColor: e.target.value })}
                />
              </div>
              <div>
                <Label>Text Color</Label>
                <Input
                  type="color"
                  value={selectedBlock.textColor || '#ffffff'}
                  onChange={(e) => updateBlock(selectedBlock.id, { textColor: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Alignment</Label>
              <Select 
                value={selectedBlock.align || 'center'}
                onValueChange={(value) => updateBlock(selectedBlock.id, { align: value as 'left' | 'center' | 'right' })}
              >
                <SelectTrigger>
                  <SelectValue />
                  </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'account-details':
        return (
          <div className="space-y-4">
            <div>
              <Label>Box Title (Optional)</Label>
              <Input
                value={selectedBlock.title || ''}
                onChange={(e) => updateBlock(selectedBlock.id, { title: e.target.value })}
                placeholder="Account Information"
              />
            </div>
            <div>
              <Label>Fields</Label>
              <div className="space-y-2 mt-2">
                {selectedBlock.fields.map((field, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 border rounded">
                    <Switch
                      checked={field.show}
                      onCheckedChange={(checked) => {
                        const updatedFields = [...selectedBlock.fields];
                        updatedFields[idx] = { ...field, show: checked };
                        updateBlock(selectedBlock.id, { fields: updatedFields });
                      }}
                    />
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <Input
                        value={field.label}
                        onChange={(e) => {
                          const updatedFields = [...selectedBlock.fields];
                          updatedFields[idx] = { ...field, label: e.target.value };
                          updateBlock(selectedBlock.id, { fields: updatedFields });
                        }}
                        placeholder="Label"
                      />
                      <Input
                        value={field.variable}
                        onChange={(e) => {
                          const updatedFields = [...selectedBlock.fields];
                          updatedFields[idx] = { ...field, variable: e.target.value };
                          updateBlock(selectedBlock.id, { fields: updatedFields });
                        }}
                        placeholder="{{variable}}"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const updatedFields = selectedBlock.fields.filter((_, i) => i !== idx);
                        updateBlock(selectedBlock.id, { fields: updatedFields });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const updatedFields = [
                      ...selectedBlock.fields,
                      { label: 'New Field', variable: '{{value}}', show: true }
                    ];
                    updateBlock(selectedBlock.id, { fields: updatedFields });
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Field
                </Button>
              </div>
            </div>
          </div>
        );

      case 'image':
        return (
          <div className="space-y-4">
            <div>
              <Label>Image Source</Label>
              <Input
                value={selectedBlock.src}
                onChange={(e) => updateBlock(selectedBlock.id, { src: e.target.value })}
                placeholder="https://example.com/image.jpg or {{COMPANY_LOGO}}"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {'{'}{'{'} COMPANY_LOGO {'}'}{'}'} for agency logo
              </p>
            </div>
            <div>
              <Label>Alt Text</Label>
              <Input
                value={selectedBlock.alt || ''}
                onChange={(e) => updateBlock(selectedBlock.id, { alt: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Width</Label>
                <Input
                  value={selectedBlock.width || ''}
                  onChange={(e) => updateBlock(selectedBlock.id, { width: e.target.value })}
                  placeholder="200px or auto"
                />
              </div>
              <div>
                <Label>Alignment</Label>
                <Select 
                  value={selectedBlock.align || 'center'}
                  onValueChange={(value) => updateBlock(selectedBlock.id, { align: value as 'left' | 'center' | 'right' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );

      case 'divider':
        return (
          <div className="space-y-4">
            <div>
              <Label>Color</Label>
              <Input
                type="color"
                value={selectedBlock.color || '#e5e7eb'}
                onChange={(e) => updateBlock(selectedBlock.id, { color: e.target.value })}
              />
            </div>
            <div>
              <Label>Thickness (px)</Label>
              <Input
                type="number"
                value={selectedBlock.thickness || 1}
                onChange={(e) => updateBlock(selectedBlock.id, { thickness: parseInt(e.target.value) })}
              />
            </div>
          </div>
        );

      case 'spacer':
        return (
          <div className="space-y-4">
            <div>
              <Label>Height (px)</Label>
              <Input
                type="number"
                value={selectedBlock.height}
                onChange={(e) => updateBlock(selectedBlock.id, { height: parseInt(e.target.value) })}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="grid grid-cols-[1fr,300px,300px] gap-4 h-[600px]">
      {/* Block Palette */}
      <Card className="overflow-auto">
        <CardHeader>
          <CardTitle>Email Blocks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => addBlock('text')}
            data-testid="add-text-block"
          >
            <Type className="h-4 w-4 mr-2" /> Text
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => addBlock('heading')}
            data-testid="add-heading-block"
          >
            <Heading1 className="h-4 w-4 mr-2" /> Heading
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => addBlock('button')}
            data-testid="add-button-block"
          >
            <MousePointer2 className="h-4 w-4 mr-2" /> Button
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => addBlock('account-details')}
            data-testid="add-account-details-block"
          >
            <CreditCard className="h-4 w-4 mr-2" /> Account Details
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => addBlock('image')}
            data-testid="add-image-block"
          >
            <ImageIcon className="h-4 w-4 mr-2" /> Image
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => addBlock('divider')}
            data-testid="add-divider-block"
          >
            <Minus className="h-4 w-4 mr-2" /> Divider
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => addBlock('spacer')}
            data-testid="add-spacer-block"
          >
            <Space className="h-4 w-4 mr-2" /> Spacer
          </Button>
        </CardContent>
      </Card>

      {/* Canvas */}
      <Card className="overflow-auto">
        <CardHeader>
          <CardTitle>Email Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2" ref={editorRef}>
            {blocks.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                Add blocks from the left to build your email
              </div>
            ) : (
              blocks
                .sort((a, b) => a.position - b.position)
                .map((block) => (
                  <div
                    key={block.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, block.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, block.id)}
                    onClick={() => setSelectedBlockId(block.id)}
                    className={`border rounded p-2 cursor-move hover:border-blue-500 transition-colors ${
                      selectedBlockId === block.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}
                    data-testid={`block-${block.type}-${block.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="h-5 w-5 text-gray-400 flex-shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        {renderBlockPreview(block)}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteBlock(block.id);
                        }}
                        data-testid={`delete-block-${block.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Properties Panel */}
      <Card className="overflow-auto">
        <CardHeader>
          <CardTitle>Block Properties</CardTitle>
        </CardHeader>
        <CardContent>
          {renderBlockEditor()}
        </CardContent>
      </Card>
    </div>
  );
}

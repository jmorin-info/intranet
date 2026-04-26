import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './badge';

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'draft',
        'in-review',
        'pending-approval',
        'approved',
        'obsolete',
        'archived',
        'info',
        'success',
        'warning',
        'error',
        'primary',
        'navy',
        'seal-orange',
        'seal-blue',
        'seal-green',
        'seal-bordeaux',
      ],
    },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
  args: {
    variant: 'info',
    size: 'md',
    children: 'Badge',
  },
};
export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {};

export const SizeSmall: Story = { args: { size: 'sm', children: 'Small' } };
export const SizeMedium: Story = { args: { size: 'md', children: 'Medium' } };

export const StatusVariants: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="draft">Brouillon</Badge>
      <Badge variant="in-review">En revue</Badge>
      <Badge variant="pending-approval">Approbation en attente</Badge>
      <Badge variant="approved">Approuvé</Badge>
      <Badge variant="obsolete">Obsolète</Badge>
      <Badge variant="archived">Archivé</Badge>
    </div>
  ),
};

export const SemanticVariants: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="info">Info</Badge>
      <Badge variant="success">Succès</Badge>
      <Badge variant="warning">Attention</Badge>
      <Badge variant="error">Erreur</Badge>
      <Badge variant="primary">Primary</Badge>
      <Badge variant="navy">Navy</Badge>
    </div>
  ),
};

export const SealPantone: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="seal-orange">PANTONE 715C</Badge>
      <Badge variant="seal-blue">PANTONE 660C</Badge>
      <Badge variant="seal-green">PANTONE 349C</Badge>
      <Badge variant="seal-bordeaux">PANTONE 202C</Badge>
    </div>
  ),
};

export const AllSizes: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex items-center gap-3">
      <Badge variant="approved" size="sm">
        Small
      </Badge>
      <Badge variant="approved" size="md">
        Medium
      </Badge>
    </div>
  ),
};

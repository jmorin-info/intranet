import type { Meta, StoryObj } from '@storybook/react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Button } from './button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          "Bouton OMNITECH SECURITY. Variant primary `#F68D2E`, navy/secondary `#004469`, " +
          'destructive `#892034`. Inclut variantes SEAL hypervision (orange/blue/green) ' +
          'pour les modules legacy.',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'primary',
        'secondary',
        'danger',
        'destructive',
        'ghost',
        'outline',
        'link',
        'seal',
        'seal-blue',
        'seal-green',
      ],
    },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg', 'icon'] },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  args: {
    children: 'Action',
    variant: 'primary',
    size: 'md',
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { variant: 'primary', children: 'Enregistrer' } };

export const Navy: Story = {
  args: { variant: 'secondary', children: 'Annuler' },
  parameters: {
    docs: {
      description: { story: 'Variante navy (alias `secondary`) — bordure + fond navy au hover.' },
    },
  },
};

export const SealOrange: Story = {
  args: { variant: 'seal', children: 'Hypervision' },
  parameters: {
    docs: {
      description: { story: 'Bouton SEAL signature : orange plein → bordure orange au hover.' },
    },
  },
};

export const Destructive: Story = { args: { variant: 'destructive', children: 'Supprimer' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Supprimer' } };
export const Ghost: Story = { args: { variant: 'ghost', children: 'Action discrète' } };
export const Outline: Story = { args: { variant: 'outline', children: 'Outline' } };
export const Link: Story = { args: { variant: 'link', children: 'En savoir plus' } };

export const SizeSmall: Story = { args: { size: 'sm', children: 'Small' } };
export const SizeMedium: Story = { args: { size: 'md', children: 'Medium' } };
export const SizeLarge: Story = { args: { size: 'lg', children: 'Large' } };

export const Loading: Story = { args: { loading: true, children: 'Enregistrement…' } };

export const Disabled: Story = { args: { disabled: true, children: 'Indisponible' } };

export const WithIcon: Story = {
  args: { children: <><Save className="h-4 w-4" /> Enregistrer</> },
};

export const IconOnly: Story = {
  args: {
    size: 'icon',
    'aria-label': 'Ajouter',
    children: <Plus className="h-4 w-4" />,
  },
};

export const AllVariants: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Navy / Secondary</Button>
      <Button variant="seal">Seal Orange</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="link">Link</Button>
      <Button variant="seal-blue">SEAL Blue</Button>
      <Button variant="seal-green">SEAL Green</Button>
    </div>
  ),
};

export const AllSizes: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Supprimer">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  ),
};

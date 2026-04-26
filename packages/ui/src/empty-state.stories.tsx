import type { Meta, StoryObj } from '@storybook/react';
import { Plus, ShieldAlert } from 'lucide-react';
import { EmptyState } from './empty-state';

const meta: Meta<typeof EmptyState> = {
  title: 'Components/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    type: {
      control: 'select',
      options: [
        'documents',
        'users',
        'news',
        'notifications',
        'search',
        'general',
        'success',
        'tickets',
      ],
    },
  },
  args: {
    type: 'documents',
    title: 'Aucun document',
    description: 'Aucun document approuvé pour le moment dans cette catégorie.',
  },
  decorators: [(Story) => <div className="w-[520px]">{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Documents: Story = {};

export const Users: Story = {
  args: {
    type: 'users',
    title: 'Aucun utilisateur',
    description: 'Aucun utilisateur ne correspond à ces critères.',
  },
};

export const News: Story = {
  args: {
    type: 'news',
    title: 'Aucune actualité',
    description: 'La rédaction n\'a publié aucune actualité récemment.',
  },
};

export const Notifications: Story = {
  args: {
    type: 'notifications',
    title: 'Tout est lu',
    description: 'Vous n\'avez aucune notification non lue.',
  },
};

export const Search: Story = {
  args: {
    type: 'search',
    title: 'Aucun résultat',
    description: 'Essayez d\'élargir vos critères de recherche.',
  },
};

export const Tickets: Story = {
  args: {
    type: 'tickets',
    title: 'Aucun ticket',
    description: 'Aucun ticket en attente d\'intervention.',
  },
};

export const Success: Story = {
  args: {
    type: 'success',
    title: 'Tâche terminée',
    description: 'Toutes les vérifications ISO 27001 ont été effectuées.',
  },
};

export const CustomIcon: Story = {
  args: {
    icon: ShieldAlert,
    type: 'general',
    title: 'Contrôle ISO non couvert',
    description: 'Aucune politique n\'adresse ce contrôle pour le moment.',
  },
};

export const WithCtaOnClick: Story = {
  args: {
    type: 'documents',
    title: 'Aucun document',
    description: 'Commencez par déposer un document.',
    cta: {
      label: 'Nouveau document',
      onClick: () => alert('Création document'),
    },
  },
};

export const WithCtaHref: Story = {
  args: {
    type: 'tickets',
    title: 'Aucun ticket',
    description: 'Consultez la base de connaissances.',
    cta: {
      label: 'Voir la KB',
      href: '#kb',
    },
  },
};

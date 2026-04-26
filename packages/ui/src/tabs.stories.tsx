import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { FileText, Inbox, Shield } from 'lucide-react';
import { Tabs } from './tabs';

const meta: Meta<typeof Tabs> = {
  title: 'Components/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="w-[640px]">{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: function DefaultRender() {
    const [active, setActive] = React.useState('all');
    return (
      <Tabs
        activeTab={active}
        onChange={setActive}
        tabs={[
          { id: 'all', label: 'Tous' },
          { id: 'mine', label: 'Mes documents' },
          { id: 'shared', label: 'Partagés' },
        ]}
      />
    );
  },
};

export const WithCounts: Story = {
  render: function WithCountsRender() {
    const [active, setActive] = React.useState('open');
    return (
      <Tabs
        activeTab={active}
        onChange={setActive}
        tabs={[
          { id: 'open', label: 'Ouverts', count: 12 },
          { id: 'progress', label: 'En cours', count: 4 },
          { id: 'closed', label: 'Fermés', count: 138 },
        ]}
      />
    );
  },
};

export const WithIcons: Story = {
  render: function WithIconsRender() {
    const [active, setActive] = React.useState('docs');
    return (
      <Tabs
        activeTab={active}
        onChange={setActive}
        tabs={[
          { id: 'docs', label: 'Documents', icon: <FileText className="h-4 w-4" />, count: 24 },
          { id: 'tickets', label: 'Tickets', icon: <Inbox className="h-4 w-4" />, count: 6 },
          { id: 'audits', label: 'Audits', icon: <Shield className="h-4 w-4" /> },
        ]}
      />
    );
  },
};

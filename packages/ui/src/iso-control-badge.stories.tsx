import type { Meta, StoryObj } from '@storybook/react';
import { IsoControlBadge } from './iso-control-badge';

const meta: Meta<typeof IsoControlBadge> = {
  title: 'Components/IsoControlBadge',
  component: IsoControlBadge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { code: 'A.5.1', title: 'Politiques de sécurité de l\'information' },
};
export default meta;
type Story = StoryObj<typeof IsoControlBadge>;

export const Default: Story = {};

export const Clickable: Story = {
  args: { onClick: () => alert('Ouvrir contrôle A.5.1') },
};

export const Multiple: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <IsoControlBadge code="A.5.1" title="Politiques" />
      <IsoControlBadge code="A.5.10" title="Acceptable use" />
      <IsoControlBadge code="A.8.1" title="Endpoint" />
      <IsoControlBadge code="A.8.16" title="Monitoring" />
    </div>
  ),
};

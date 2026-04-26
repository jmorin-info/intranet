import type { Meta, StoryObj } from '@storybook/react';
import { StatusBadge } from './status-badge';

const meta: Meta<typeof StatusBadge> = {
  title: 'Components/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { status: 'APPROVED', showIcon: true },
  argTypes: {
    status: {
      control: 'select',
      options: [
        'DRAFT',
        'IN_REVIEW',
        'REVIEW_APPROVED',
        'PENDING_APPROVAL',
        'APPROVED',
        'OBSOLETE',
        'ARCHIVED',
        'OPEN',
        'IN_PROGRESS',
        'WAITING',
        'RESOLVED',
        'CLOSED',
        'DETECTED',
        'UNDER_INVESTIGATION',
        'CONTAINED',
        'ERADICATED',
        'RECOVERED',
      ],
    },
  },
};
export default meta;
type Story = StoryObj<typeof StatusBadge>;

export const Default: Story = {};

export const DocumentStatuses: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(['DRAFT', 'IN_REVIEW', 'REVIEW_APPROVED', 'PENDING_APPROVAL', 'APPROVED', 'OBSOLETE', 'ARCHIVED'] as const).map(
        (s) => (
          <StatusBadge key={s} status={s} />
        ),
      )}
    </div>
  ),
};

export const TicketStatuses: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'] as const).map((s) => (
        <StatusBadge key={s} status={s} />
      ))}
    </div>
  ),
};

export const IncidentStatuses: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(['DETECTED', 'UNDER_INVESTIGATION', 'CONTAINED', 'ERADICATED', 'RECOVERED', 'CLOSED'] as const).map(
        (s) => (
          <StatusBadge key={s} status={s} />
        ),
      )}
    </div>
  ),
};

export const NoIcon: Story = {
  args: { status: 'APPROVED', showIcon: false },
};

import type { Meta, StoryObj } from '@storybook/react';
import { SignatureBadge } from './signature-badge';

const meta: Meta<typeof SignatureBadge> = {
  title: 'Components/SignatureBadge',
  component: SignatureBadge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { status: 'PENDING' },
  argTypes: {
    status: {
      control: 'inline-radio',
      options: ['PENDING', 'SIGNED', 'REJECTED', 'EXPIRED'],
    },
  },
};
export default meta;
type Story = StoryObj<typeof SignatureBadge>;

export const Pending: Story = { args: { status: 'PENDING' } };
export const Signed: Story = { args: { status: 'SIGNED' } };
export const Rejected: Story = { args: { status: 'REJECTED' } };
export const Expired: Story = { args: { status: 'EXPIRED' } };

export const All: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-wrap gap-2">
      <SignatureBadge status="PENDING" />
      <SignatureBadge status="SIGNED" />
      <SignatureBadge status="REJECTED" />
      <SignatureBadge status="EXPIRED" />
    </div>
  ),
};

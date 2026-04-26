import type { Meta, StoryObj } from '@storybook/react';
import { Avatar } from './avatar';

const meta: Meta<typeof Avatar> = {
  title: 'Components/Avatar',
  component: Avatar,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
  args: { initials: 'JD', size: 'md' },
};
export default meta;
type Story = StoryObj<typeof Avatar>;

export const Initials: Story = {};

export const SmallInitials: Story = { args: { size: 'sm', initials: 'JD' } };
export const LargeInitials: Story = { args: { size: 'lg', initials: 'JD' } };

export const WithImage: Story = {
  args: {
    src: 'https://i.pravatar.cc/120?img=12',
    initials: 'JD',
  },
};

export const ImageFallback: Story = {
  args: {
    src: 'https://broken-url.invalid/avatar.jpg',
    initials: 'AB',
  },
  parameters: {
    docs: { description: { story: 'Image en erreur → fallback initiales.' } },
  },
};

export const AllSizes: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex items-end gap-4">
      <Avatar size="sm" initials="SM" />
      <Avatar size="md" initials="MD" />
      <Avatar size="lg" initials="LG" />
    </div>
  ),
};

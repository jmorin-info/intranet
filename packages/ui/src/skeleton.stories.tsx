import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton, SkeletonCard, SkeletonTable, SkeletonList } from './skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'Components/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {
  render: () => (
    <div className="w-[360px] space-y-3">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  ),
};

export const Card: Story = {
  render: () => (
    <div className="w-[360px]">
      <SkeletonCard />
    </div>
  ),
};

export const Table: Story = {
  render: () => (
    <div className="w-[640px]">
      <SkeletonTable rows={5} columns={4} />
    </div>
  ),
};

export const TableCustom: Story = {
  render: () => (
    <div className="w-[640px]">
      <SkeletonTable rows={3} columns={6} />
    </div>
  ),
};

export const List: Story = {
  render: () => (
    <div className="w-[420px]">
      <SkeletonList items={4} />
    </div>
  ),
};

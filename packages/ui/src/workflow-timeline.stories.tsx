import type { Meta, StoryObj } from '@storybook/react';
import { WorkflowTimeline, type WorkflowStep } from './workflow-timeline';

const meta: Meta<typeof WorkflowTimeline> = {
  title: 'Components/WorkflowTimeline',
  component: WorkflowTimeline,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="w-[420px]">{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof WorkflowTimeline>;

const STEPS: WorkflowStep[] = [
  { label: 'Création', status: 'completed', actor: 'J. Dupont', date: '02/04/2026' },
  { label: 'Revue technique', status: 'completed', actor: 'M. Martin', date: '08/04/2026' },
  { label: 'Approbation RSSI', status: 'current', actor: 'S. Bernard', date: '14/04/2026' },
  { label: 'Diffusion', status: 'pending' },
];

export const Default: Story = {
  args: { steps: STEPS },
};

export const AllCompleted: Story = {
  args: {
    steps: STEPS.map((s) => ({ ...s, status: 'completed' as const })),
  },
};

export const AllPending: Story = {
  args: {
    steps: STEPS.map((s) => ({ ...s, status: 'pending' as const, date: undefined, actor: undefined })),
  },
};

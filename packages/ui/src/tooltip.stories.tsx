import type { Meta, StoryObj } from '@storybook/react';
import { Info } from 'lucide-react';
import { Tooltip } from './tooltip';
import { Button } from './button';

const meta: Meta<typeof Tooltip> = {
  title: 'Components/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    side: { control: 'inline-radio', options: ['top', 'bottom', 'left', 'right'] },
    delayDuration: { control: { type: 'number', min: 0, max: 2000, step: 50 } },
    disabled: { control: 'boolean' },
  },
  args: {
    content: 'Action irréversible',
    side: 'top',
    delayDuration: 300,
    children: <Button variant="outline">Survolez-moi</Button>,
  },
};
export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Top: Story = { args: { side: 'top' } };
export const Bottom: Story = { args: { side: 'bottom' } };
export const Left: Story = { args: { side: 'left' } };
export const Right: Story = { args: { side: 'right' } };

export const FastDelay: Story = {
  args: { delayDuration: 0, content: 'Affichage instantané' },
};

export const SlowDelay: Story = {
  args: { delayDuration: 1000, content: 'Apparaît après 1s' },
};

export const OnIcon: Story = {
  args: {
    content: 'Statut conformité ISO 27001',
    children: (
      <button
        type="button"
        aria-label="Information"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-seal-navy/10 text-seal-navy hover:bg-seal-navy/20"
      >
        <Info className="h-4 w-4" />
      </button>
    ),
  },
};

export const Disabled: Story = {
  args: { disabled: true, content: 'Non visible (désactivé)' },
};

export const AllSides: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="grid grid-cols-3 gap-12 place-items-center p-12">
      <div />
      <Tooltip content="Top" side="top">
        <Button variant="outline">Top</Button>
      </Tooltip>
      <div />
      <Tooltip content="Left" side="left">
        <Button variant="outline">Left</Button>
      </Tooltip>
      <div />
      <Tooltip content="Right" side="right">
        <Button variant="outline">Right</Button>
      </Tooltip>
      <div />
      <Tooltip content="Bottom" side="bottom">
        <Button variant="outline">Bottom</Button>
      </Tooltip>
      <div />
    </div>
  ),
};

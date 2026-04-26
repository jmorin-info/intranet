import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from './textarea';

const meta: Meta<typeof Textarea> = {
  title: 'Components/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    label: 'Description',
    placeholder: 'Décrivez l\'incident…',
    rows: 4,
  },
  decorators: [(Story) => <div className="w-[420px]">{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {};
export const Required: Story = { args: { required: true, label: 'Justification *' } };
export const Error: Story = {
  args: { error: 'La description doit faire au moins 10 caractères.' },
};

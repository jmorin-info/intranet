import type { Meta, StoryObj } from '@storybook/react';
import { Select } from './select';

const SAMPLE_OPTIONS = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'in-review', label: 'En revue' },
  { value: 'approved', label: 'Approuvé' },
  { value: 'archived', label: 'Archivé' },
];

const meta: Meta<typeof Select> = {
  title: 'Components/Select',
  component: Select,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
  },
  args: {
    label: 'Statut du document',
    options: SAMPLE_OPTIONS,
    placeholder: 'Sélectionnez un statut…',
  },
  decorators: [(Story) => <div className="w-[320px]">{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {};

export const Required: Story = {
  args: { required: true, label: 'Service * (obligatoire)' },
};

export const WithHelperText: Story = {
  args: {
    helperText: 'Visible aux signataires de la GED',
  },
};

export const Error: Story = {
  args: { error: 'Veuillez choisir un statut' },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'approved' },
};

export const PreSelected: Story = {
  args: { defaultValue: 'in-review' },
};

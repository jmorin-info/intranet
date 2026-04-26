import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './input';

const meta: Meta<typeof Input> = {
  title: 'Components/Input',
  component: Input,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'search', 'tel', 'url'],
    },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
  },
  args: {
    label: 'Email',
    placeholder: 'jean.dupont@omnitech-security.fr',
    type: 'email',
  },
  decorators: [(Story) => <div className="w-[320px]">{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {};

export const Required: Story = {
  args: { label: 'Mot de passe', type: 'password', required: true, placeholder: '••••••••' },
};

export const WithHelperText: Story = {
  args: {
    label: 'Numéro de téléphone',
    type: 'tel',
    helperText: 'Format international : +33 6 12 34 56 78',
  },
};

export const Error: Story = {
  args: {
    label: 'Email',
    type: 'email',
    defaultValue: 'invalid-email',
    error: 'Adresse email invalide',
  },
};

export const Disabled: Story = {
  args: { label: 'Identifiant LDAP', defaultValue: 'jdupont', disabled: true },
};

export const Number: Story = {
  args: { label: 'Quantité', type: 'number', defaultValue: 42 },
};

export const Password: Story = {
  args: { label: 'Mot de passe', type: 'password', placeholder: '••••••••' },
};

export const Text: Story = {
  args: { label: 'Nom complet', type: 'text', placeholder: 'Jean Dupont' },
};

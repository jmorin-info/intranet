import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { SearchInput } from './search-input';

const meta: Meta<typeof SearchInput> = {
  title: 'Components/SearchInput',
  component: SearchInput,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div className="w-[360px]">{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof SearchInput>;

export const Default: Story = {
  render: function DefaultRender() {
    const [value, setValue] = React.useState('');
    return (
      <SearchInput
        value={value}
        onChange={setValue}
        placeholder="Rechercher un document, un ticket…"
      />
    );
  },
};

export const WithValue: Story = {
  render: function WithValueRender() {
    const [value, setValue] = React.useState('ISO 27001');
    return <SearchInput value={value} onChange={setValue} />;
  },
};

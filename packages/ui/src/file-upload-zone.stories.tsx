import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { FileUploadZone } from './file-upload-zone';

const meta: Meta<typeof FileUploadZone> = {
  title: 'Components/FileUploadZone',
  component: FileUploadZone,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="w-[520px]">{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof FileUploadZone>;

export const Empty: Story = {
  render: function EmptyRender() {
    const [file, setFile] = React.useState<File | null>(null);
    return (
      <FileUploadZone
        onFileSelect={setFile}
        selectedFile={file}
        onClear={() => setFile(null)}
      />
    );
  },
};

export const WithFile: Story = {
  render: () => {
    const fakeFile = new File(['x'.repeat(1024 * 256)], 'politique-securite.pdf', {
      type: 'application/pdf',
    });
    return (
      <FileUploadZone
        onFileSelect={() => {}}
        selectedFile={fakeFile}
        onClear={() => {}}
      />
    );
  },
};

export const WithError: Story = {
  render: () => (
    <FileUploadZone
      onFileSelect={() => {}}
      error="Le fichier dépasse 50 Mo."
    />
  ),
};

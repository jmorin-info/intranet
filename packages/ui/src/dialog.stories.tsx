import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { Dialog, ConfirmDialog } from './dialog';
import { Button } from './button';
import { Input } from './input';

type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface DialogDemoProps {
  size: DialogSize;
  title: string;
  description?: string;
}

function DialogDemo({ size, title, description }: DialogDemoProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="p-6">
      <Button onClick={() => setOpen(true)}>Ouvrir le dialog ({size})</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        size={size}
      >
        <div className="space-y-3">
          <Input label="Titre" defaultValue="Politique de sécurité ISO 27001" />
          <Input label="Référence" defaultValue="POL-SEC-001" />
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => setOpen(false)}>Enregistrer</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

const meta: Meta<typeof DialogDemo> = {
  title: 'Components/Dialog',
  component: DialogDemo,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg', 'xl', 'full'],
    },
  },
  args: {
    title: 'Modifier le document',
    description: 'Mettez à jour les informations du document avant validation.',
    size: 'md',
  },
};
export default meta;
type Story = StoryObj<typeof DialogDemo>;

export const Small: Story = { args: { size: 'sm' } };
export const Medium: Story = { args: { size: 'md' } };
export const Large: Story = { args: { size: 'lg' } };
export const ExtraLarge: Story = { args: { size: 'xl' } };
export const FullScreen: Story = { args: { size: 'full' } };

export const Confirm: StoryObj = {
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        story: 'Variante `ConfirmDialog` — choix binaire avec couleur danger par défaut.',
      },
    },
  },
  render: function ConfirmRender() {
    const [open, setOpen] = React.useState(false);
    return (
      <div className="p-6">
        <Button variant="danger" onClick={() => setOpen(true)}>
          Supprimer le document
        </Button>
        <ConfirmDialog
          open={open}
          onClose={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
          title="Supprimer le document ?"
          description="Cette action est irréversible. Le document sera retiré de la GED."
          confirmLabel="Supprimer"
          cancelLabel="Annuler"
          variant="danger"
        />
      </div>
    );
  },
};

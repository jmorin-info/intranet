import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardHeader, CardContent, CardFooter } from './card';
import { Button } from './button';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'orange', 'blue', 'green', 'bordeaux', 'bordered', 'elevated', 'flat'],
    },
    accent: { control: 'boolean' },
    hoverable: { control: 'boolean' },
  },
};
export default meta;
type Story = StoryObj<typeof Card>;

const SampleBody = (
  <CardContent>
    <p className="text-sm text-seal-navy/80 dark:text-slate-300">
      Carte de démonstration — bloc de contenu standard avec un texte d'accompagnement.
    </p>
  </CardContent>
);

export const Default: Story = {
  render: (args) => (
    <Card {...args} className="w-[360px]">
      <CardHeader>
        <h3 className="text-base font-semibold">Titre de la carte</h3>
      </CardHeader>
      {SampleBody}
    </Card>
  ),
};

export const Bordered: Story = {
  args: { variant: 'bordered' },
  render: Default.render,
};

export const Elevated: Story = {
  args: { variant: 'elevated' },
  render: Default.render,
};

export const Flat: Story = {
  args: { variant: 'flat' },
  render: Default.render,
};

export const Hoverable: Story = {
  args: { hoverable: true },
  render: Default.render,
};

export const WithHeaderContentFooter: Story = {
  render: () => (
    <Card className="w-[420px]" accent>
      <CardHeader seal>
        <h3 className="text-base font-semibold text-seal-navy dark:text-white">
          Audit interne ISO 27001
        </h3>
        <p className="text-xs text-seal-gray-500 mt-0.5">
          Annexe A.5 — Politiques de sécurité
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm text-seal-navy/80 dark:text-slate-300">
          <li>• Politique de mot de passe</li>
          <li>• Charte d'utilisation des SI</li>
          <li>• Procédure de gestion des accès</li>
        </ul>
      </CardContent>
      <CardFooter>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm">
            Annuler
          </Button>
          <Button size="sm">Valider</Button>
        </div>
      </CardFooter>
    </Card>
  ),
};

export const PantoneVariants: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-[720px]">
      {(['orange', 'blue', 'green', 'bordeaux'] as const).map((v) => (
        <Card key={v} variant={v}>
          <CardHeader>
            <h3 className="text-sm font-semibold capitalize">{v}</h3>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-seal-gray-500">Variante PANTONE — accent supérieur 3px.</p>
          </CardContent>
        </Card>
      ))}
    </div>
  ),
};

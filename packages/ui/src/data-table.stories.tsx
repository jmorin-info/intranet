import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { DataTable, type Column } from './data-table';
import { StatusBadge } from './status-badge';

interface Document {
  id: string;
  title: string;
  reference: string;
  status: string;
  owner: string;
}

const SAMPLE: Document[] = [
  { id: '1', title: 'Politique de sécurité', reference: 'POL-001', status: 'APPROVED', owner: 'J. Dupont' },
  { id: '2', title: 'Charte SI', reference: 'POL-002', status: 'IN_REVIEW', owner: 'M. Martin' },
  { id: '3', title: 'Procédure incident', reference: 'PROC-014', status: 'DRAFT', owner: 'S. Bernard' },
  { id: '4', title: 'Plan de reprise', reference: 'PLN-003', status: 'PENDING_APPROVAL', owner: 'L. Petit' },
  { id: '5', title: 'Backup SOP', reference: 'SOP-021', status: 'OBSOLETE', owner: 'C. Robert' },
];

const COLUMNS: Column<Document>[] = [
  { key: 'reference', header: 'Référence', sortable: true, className: 'font-mono text-xs w-32' },
  { key: 'title', header: 'Titre', sortable: true },
  {
    key: 'status',
    header: 'Statut',
    render: (item) => <StatusBadge status={item.status} />,
    className: 'w-48',
  },
  { key: 'owner', header: 'Propriétaire', className: 'w-40' },
];

const meta: Meta<typeof DataTable<Document>> = {
  title: 'Components/DataTable',
  component: DataTable<Document>,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="w-[860px]">{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof DataTable<Document>>;

export const Default: Story = {
  render: function DefaultRender() {
    const [sortBy, setSortBy] = React.useState('reference');
    const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('asc');
    return (
      <DataTable<Document>
        columns={COLUMNS}
        data={SAMPLE}
        keyExtractor={(d) => d.id}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={(key) => {
          if (sortBy === key) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
          } else {
            setSortBy(key);
            setSortOrder('asc');
          }
        }}
      />
    );
  },
};

export const Loading: Story = {
  render: () => (
    <DataTable<Document>
      columns={COLUMNS}
      data={[]}
      keyExtractor={(d) => d.id}
      loading
    />
  ),
};

export const Empty: Story = {
  render: () => (
    <DataTable<Document>
      columns={COLUMNS}
      data={[]}
      keyExtractor={(d) => d.id}
      emptyMessage="Aucun document trouvé"
    />
  ),
};

export const WithPagination: Story = {
  render: function PagedRender() {
    const [page, setPage] = React.useState(2);
    return (
      <DataTable<Document>
        columns={COLUMNS}
        data={SAMPLE}
        keyExtractor={(d) => d.id}
        page={page}
        totalPages={7}
        total={142}
        onPageChange={setPage}
      />
    );
  },
};

export const Clickable: Story = {
  render: () => (
    <DataTable<Document>
      columns={COLUMNS}
      data={SAMPLE}
      keyExtractor={(d) => d.id}
      onRowClick={(d) => alert(`Ouvrir ${d.reference}`)}
    />
  ),
};

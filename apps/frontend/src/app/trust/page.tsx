import { TrustHero } from './components/trust-hero';
import { TrustScore } from './components/trust-score';
import { TrustCertifications } from './components/trust-certifications';
import { TrustCommitments } from './components/trust-commitments';
import { TrustArchitecture } from './components/trust-architecture';
import { TrustSubprocessors } from './components/trust-subprocessors';
import { TrustDisclosure } from './components/trust-disclosure';
import { TrustIncidents } from './components/trust-incidents';
import { TrustContact } from './components/trust-contact';

// Page marketing publique : pas d'auth, indexable.
// Les metadata SEO (title, description, OpenGraph, robots) sont déclarés
// dans le layout /trust/layout.tsx.
export default function TrustPage() {
  return (
    <div className="pb-8">
      <TrustHero />
      <TrustScore />
      <TrustCertifications />
      <TrustCommitments />
      <TrustArchitecture />
      <TrustSubprocessors />
      <TrustDisclosure />
      <TrustIncidents />
      <TrustContact />
    </div>
  );
}

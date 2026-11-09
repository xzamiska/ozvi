import { landingMetadata, LandingPage } from "../landing-page";

export const dynamic = "force-dynamic";
export const generateMetadata = () => landingMetadata("hu");

export default function Page() {
  return <LandingPage locale="hu" />;
}

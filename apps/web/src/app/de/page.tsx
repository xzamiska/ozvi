import { landingMetadata, LandingPage } from "../landing-page";

export const dynamic = "force-dynamic";
export const generateMetadata = () => landingMetadata("de");

export default function Page() {
  return <LandingPage locale="de" />;
}

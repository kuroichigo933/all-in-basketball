import { notFound } from "next/navigation";
import { getSampleProgram, SAMPLE_PROGRAMS } from "@/lib/sample-programs";
import SamplePlayer from "./SamplePlayer";

export function generateStaticParams() {
  return SAMPLE_PROGRAMS.map((p) => ({ id: p.id }));
}

export default function SamplePlayPage({ params }: { params: { id: string } }) {
  const program = getSampleProgram(params.id);
  if (!program) notFound();
  return <SamplePlayer program={program} />;
}

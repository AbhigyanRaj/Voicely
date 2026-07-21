import { cn } from "@/lib/utils";
import { Marquee } from "@/components/ui/marquee";
import { User } from "lucide-react";

const reviews = [
  {
    name: "Aravind",
    username: "@iitdelhi",
    body: "The voice models actually sound natural, not like those robotic text-to-speech engines. Using it for my final year project right now!",
    img: "",
  },
  {
    name: "Karan",
    username: "@dtu",
    body: "Crazy good developer experience. The API docs are super clear. Replaced our entire hacky IVR backend with just 3 lines of code.",
    img: "",
  },
  {
    name: "Rohan",
    username: "@bitsgoa",
    body: "Integrated this for our SIH project in under an hour. The latency is insanely low compared to our previous Twilio + OpenAI setup.",
    img: "",
  },
  {
    name: "Rahul",
    username: "@rahul_dev",
    body: "We've been testing voice agents for our campus startup and this is by far the fastest. Zero awkward pauses during the conversation.",
    img: "",
  },
  {
    name: "Priya",
    username: "@igdtuw",
    body: "Built an automated receptionist for my dad's clinic over the weekend. Mind blown by how well it handles customer interruptions.",
    img: "",
  },
  {
    name: "Aditi",
    username: "@nsut",
    body: "Was struggling with audio streaming latency for days. Voicely just worked out of the box. Absolutely saved our hackathon submission.",
    img: "",
  },
]

const firstRow = reviews.slice(0, reviews.length / 2)
const secondRow = reviews.slice(reviews.length / 2)

const ReviewCard = ({
  img,
  name,
  username,
  body,
}: {
  img: string
  name: string
  username: string
  body: string
}) => {
  return (
    <figure
      className={cn(
        "relative h-full w-64 overflow-hidden rounded-xl border p-4",
        // light styles
        "border-gray-950/[.1] bg-gray-950/[.01]",
        // dark styles
        "dark:border-gray-50/[.1] dark:bg-gray-50/[.10]"
      )}
    >
      <div className="flex flex-row items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 border border-zinc-200">
          <User className="h-5 w-5 text-zinc-500" />
        </div>
        <div className="flex flex-col">
          <figcaption className="text-sm font-medium text-zinc-900 dark:text-white">
            {name}
          </figcaption>
          <p className="text-xs font-medium text-zinc-500 dark:text-white/40">{username}</p>
        </div>
      </div>
      <blockquote className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{body}</blockquote>
    </figure>
  )
}
export function TestimonialsMarquee() {
  return (
    <div className="relative flex w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#F5F7FA] to-white py-16 md:py-24 border-b border-zinc-100">
      <div className="flex flex-col items-center justify-center mb-16">
        <h2 className="text-4xl md:text-5xl font-normal text-zinc-900 tracking-tight text-center">
          Developers love Voicely
        </h2>
      </div>
      <div 
        className="w-full"
        style={{
          maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)'
        }}
      >
        <Marquee className="[--duration:30s] mb-4">
          {firstRow.map((review) => (
            <ReviewCard key={review.username} {...review} />
          ))}
        </Marquee>
        <Marquee reverse className="[--duration:30s]">
          {secondRow.map((review) => (
            <ReviewCard key={review.username} {...review} />
          ))}
        </Marquee>
      </div>
    </div>
  );
}


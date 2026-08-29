import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Quote, ChevronLeft, ChevronRight } from 'lucide-react';

const CAROUSEL_DATA = [
  { url: '/login/aditya-siva-HlQi14Q_iO0-unsplash.jpg', quote: 'You have the right to perform your prescribed duty, but you are not entitled to the fruits of action.', author: 'Sri Krishna' },
  { url: '/login/danist-soh-bviex5lwf3s-unsplash.jpg', quote: 'Stay hungry, stay foolish.', author: 'Steve Jobs' },
  { url: '/login/debashis-rc-biswas-dyPFnxxUhYk-unsplash.jpg', quote: 'What we know is a drop, what we do not know is an ocean.', author: 'Isaac Newton' },
  { url: '/login/dino-reichmuth-A5rCN8626Ck-unsplash.jpg', quote: 'Nothing at all takes place in the universe in which some rule of maximum or minimum does not appear.', author: 'Leonhard Euler' },
  { url: '/login/ed-wingate-2ZBvc0gR00E-unsplash.jpg', quote: 'The present is theirs; the future, for which I really worked, is mine.', author: 'Nikola Tesla' },
  { url: '/login/gautam-arora-dCnHbVhM2w8-unsplash.jpg', quote: 'We can only see a short distance ahead, but we can see plenty there that needs to be done.', author: 'Alan Turing' },
  { url: '/login/katelyn-g-YQpdleA-gL4-unsplash.jpg', quote: 'Freedom is what you do with what has been done to you.', author: 'Jean-Paul Sartre' },
  { url: '/login/laura-lugaresi-4o2gxfuD5BU-unsplash.jpg', quote: 'Be the change you wish to see in the world.', author: 'Mahatma Gandhi' },
  { url: '/login/leonard-cotte-R5scocnOOdM-unsplash.jpg', quote: 'Arise, awake, and stop not until the goal is reached.', author: 'Swami Vivekananda' },
  { url: '/login/melanie-magdalena-KpBAYMNf9Tw-unsplash.jpg', quote: 'Darkness cannot drive out darkness; only light can do that. Hate cannot drive out hate; only love can do that.', author: 'Martin Luther King Jr.' },
  { url: '/login/paras-verma-J6J7YIgCE0g-unsplash.jpg', quote: 'Not all of us can do great things. But we can do small things with great love.', author: 'Mother Teresa' },
  { url: '/login/priyanka-roy-TSAKo1gHCVg-unsplash.jpg', quote: 'It always seems impossible until it is done.', author: 'Nelson Mandela' },
  { url: '/login/remi-bertogliati-4tVV-PW4-YM-unsplash.jpg', quote: 'You have power over your mind, not outside events. Realize this, and you will find strength.', author: 'Marcus Aurelius' },
  { url: '/login/sammy-leigh-scholl-usk52YRwGrM-unsplash.jpg', quote: 'Courage is knowing what not to fear.', author: 'Plato' },
  { url: '/login/sergio-capuzzimati-Lr0dNUWVLrE-unsplash.jpg', quote: 'The unexamined life is not worth living.', author: 'Socrates' },
  { url: '/login/tianshu-liu-aqZ3UAjs_M4-unsplash.jpg', quote: 'Democracy is the government of the people, by the people, for the people.', author: 'Abraham Lincoln' },
  { url: '/login/vivek-kumar-7k1IKQZikSc-unsplash.jpg', quote: 'Try to be a rainbow in someone else\'s cloud.', author: 'Maya Angelou' },
  { url: '/login/zane-lee-YTeAiHWG-Gs-unsplash.jpg', quote: 'The answer, my friend, is blowing in the wind.', author: 'Bob Dylan' },
  { url: '/login/priyanka-roy-fBo3MwGuiWw-unsplash.jpg', quote: 'People rarely succeed unless they have fun in what they are doing.', author: 'Dale Carnegie' },
  { url: '/login/ash-saribekyan-aNRpD1YVwAU-unsplash.jpg', quote: 'It is during our darkest moments that we must focus to see the light.', author: 'Aristotle' },
  { url: '/login/bhavya-patel-sz4gZWKAyCw-unsplash.jpg', quote: 'Well done is better than well said.', author: 'Benjamin Franklin' },
  { url: '/login/christian-wiediger-O84_bYe3idQ-unsplash.jpg', quote: 'Learning never exhausts the mind.', author: 'Leonardo da Vinci' },
  { url: '/login/edewaa-foster-aWkpMIIC5aY-unsplash.jpg', quote: 'Life is really simple, but we insist on making it complicated.', author: 'Confucius' },
  { url: '/login/gil-xanders-IClwHdfzi-M-unsplash.jpg', quote: 'Nothing in life is to be feared, it is only to be understood.', author: 'Marie Curie' },
  { url: '/login/graham-pengelly-IWkw2SaGtvk-unsplash.jpg', quote: 'We are made of star-stuff.', author: 'Carl Sagan' },
  { url: '/login/komorebi-photo-P77pGpCjNGA-unsplash.jpg', quote: 'However difficult life may seem, there is always something you can do and succeed at.', author: 'Stephen Hawking' },
  { url: '/login/pratikxox-HaWTHo0YlGk-unsplash.jpg', quote: 'Life is like riding a bicycle. To keep your balance, you must keep moving.', author: 'Albert Einstein' },
  { url: '/login/rudy-issa-fnmu65GYnoU-unsplash.jpg', quote: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
  { url: '/login/sam-pearce-warrilow-Y6gXUtH1MbA-unsplash.jpg', quote: 'Whether you think you can or you think you can\'t, you\'re right.', author: 'Henry Ford' },
];

export default function AuthLayout() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [paused, setPaused] = useState(false);

  const CAROUSEL_INTERVAL = 20000;
  const TRANSITION_DURATION = 1500;

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setImageLoaded(false);
      setImgError(false);
      setCurrentIndex((prev) => (prev + 1) % CAROUSEL_DATA.length);
    }, CAROUSEL_INTERVAL);
    return () => clearInterval(timer);
  }, [paused]);

  const goTo = (index: number) => {
    setPaused(true);
    setImageLoaded(false);
    setImgError(false);
    setCurrentIndex((index + CAROUSEL_DATA.length) % CAROUSEL_DATA.length);
    setTimeout(() => setPaused(false), 8000);
  };

  const current = CAROUSEL_DATA[currentIndex];

  return (
    <div className="min-h-screen font-sans overflow-hidden relative bg-slate-950">
      {/* Full background image */}
      <div className="absolute inset-0 z-0">
        {!imgError && (
          <div
            className={`absolute inset-0 transition-opacity ease-in-out duration-1000 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            style={{ transitionDuration: `${TRANSITION_DURATION}ms` }}
          >
            <img
              src={current.url}
              alt="Background"
              className="w-full h-full object-cover brightness-40 contrast-105"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImgError(true)}
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-black/20" />
      </div>

      {/* Prev / Next arrows */}
      <button
        onClick={() => goTo(currentIndex - 1)}
        aria-label="Previous image"
        className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/30 backdrop-blur border border-white/15 text-white/70 hover:text-white hover:bg-black/50 flex items-center justify-center transition-all"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => goTo(currentIndex + 1)}
        aria-label="Next image"
        className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/30 backdrop-blur border border-white/15 text-white/70 hover:text-white hover:bg-black/50 flex items-center justify-center transition-all"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Content: login on left, quote on right */}
      <div className="relative z-10 flex items-center justify-between min-h-screen px-6 sm:px-12 lg:px-20 gap-10">
        {/* Left: Login Card */}
        <div className="w-full max-w-[440px]">
          <Outlet />
        </div>

        {/* Right: Quote */}
        <div className="hidden lg:block flex-shrink-0 max-w-[460px]">
          <div key={currentIndex} style={{ animation: 'quoteFade 0.8s ease-in-out' }}>
            <Quote className="w-10 h-10 text-blue-400/80 mb-6" />
            <p className="text-white text-2xl md:text-3xl font-bold leading-snug tracking-tight">
              "{current.quote}"
            </p>
            <div className="flex items-center gap-3 mt-6">
              <div className="w-10 h-0.5 bg-blue-400/80" />
              <p className="text-white text-base md:text-lg font-semibold tracking-wide">
                {current.author}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
        {CAROUSEL_DATA.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Go to image ${i + 1}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === currentIndex ? 'w-6 bg-blue-400' : 'w-1.5 bg-white/30 hover:bg-white/50'
            }`}
          />
        ))}
      </div>

      <style>{`
        @keyframes quoteFade {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

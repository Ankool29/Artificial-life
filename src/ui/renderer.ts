import type { Cue, InteractiveObject, Point, World } from "../sim/types";
import { OBJECT_COLORS } from "./object-info";

export const COLORS: Record<Cue, string> = {
  amber: "#efc45f",
  blue: "#81c8db",
  rose: "#ed9f9f",
};
export const NAMES: Record<Cue, string> = {
  amber: "Grain solaire",
  blue: "Perle de rosée",
  rose: "Baie corail",
};

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private observer: ResizeObserver;
  private width = 600;
  private height = 680;
  private dpr = 1;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }

  private resize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = bounds.width;
    this.height = bounds.height;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  position(clientX: number, clientY: number): Point {
    const bounds = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - bounds.left) / bounds.width) * 600,
      y: ((clientY - bounds.top) / bounds.height) * 680,
    };
  }

  draw(world: World, showSenses: boolean): void {
    const ctx = this.ctx;
    ctx.setTransform(
      (this.dpr * this.width) / 600,
      0,
      0,
      (this.dpr * this.height) / 680,
      0,
      0,
    );
    ctx.clearRect(0, 0, 600, 680);
    // Static procedural scenery is independent of the simulation's PRNG.
    const background = ctx.createLinearGradient(0, 0, 600, 680);
    background.addColorStop(0, "#e3e7cd");
    background.addColorStop(0.5, "#cbd8b6");
    background.addColorStop(1, "#b4c8a6");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 600, 680);
    ctx.fillStyle = "#f8f3da55";
    this.ellipse(100, 120, 240, 90, -0.6);
    this.ellipse(580, 290, 270, 60, -0.8);
    ctx.strokeStyle = "#68896716";
    ctx.lineWidth = 1;
    for (let row = 0; row < 19; row++)
      for (let col = 0; col < 17; col++) {
        const x = col * 40 + (row % 2) * 20;
        const y = row * 40;
        ctx.beginPath();
        ctx.moveTo(x - 2, y);
        ctx.lineTo(x + 2, y);
        ctx.moveTo(x, y - 2);
        ctx.lineTo(x, y + 2);
        ctx.stroke();
      }
    ctx.strokeStyle = "#6c8c6d45";
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.ellipse(300, 340, 220, 242, -0.1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 34; i++) {
      const x = (i * 173 + 37) % 600;
      const y = (i * 109 + 23) % 680;
      if (x > 65 && x < 535 && y > 65 && y < 615) continue;
      this.plant(x, y, 0.7 + (i % 3) * 0.3, i * 1.2);
    }
    ctx.fillStyle = "#7b937b35";
    for (let i = 0; i < 30; i++)
      this.ellipse(
        (i * 127 + 41) % 590,
        (i * 181 + 59) % 670,
        2 + (i % 3),
        1.5,
        i,
      );
    const c = world.creature;
    if (showSenses && c.alive) {
      ctx.strokeStyle = "#366d6660";
      ctx.fillStyle = "#ffffff0a";
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.genome.genes.vision, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      if (c.action.kind === "seek") {
        const id = c.action.foodId;
        const target = world.foods.find((f) => f.id === id);
        if (target) {
          ctx.strokeStyle = "#30665d99";
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
        }
      }
      if (c.action.kind === "inspect" || c.action.kind === "interact") {
        const id = c.action.objectId;
        const target = world.objects.find((object) => object.id === id);
        if (target) {
          ctx.strokeStyle = "#7e638d99";
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
        }
      }
    }
    for (const object of world.objects) {
      const active =
        c.action.kind === "interact" && c.action.objectId === object.id;
      this.object(object, active, object.availableAt > world.tick);
    }
    for (const food of world.foods) this.food(food.x, food.y, food.cue);
    this.creature(world);
  }

  private object(
    object: InteractiveObject,
    active: boolean,
    cooling: boolean,
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(object.x, object.y);
    ctx.fillStyle = "#344c3825";
    this.ellipse(0, 17, 23, 7);
    ctx.globalAlpha = cooling ? 0.6 : 1;
    ctx.fillStyle = OBJECT_COLORS[object.cue];
    ctx.strokeStyle = "#607457";
    ctx.lineWidth = 2;
    if (object.cue === "moss") {
      ctx.beginPath();
      ctx.ellipse(0, 2, 23, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#c8dba7";
      for (let i = 0; i < 5; i++)
        this.ellipse(-14 + i * 7, (i % 2) * 6 - 4, 3, 3);
    } else if (object.cue === "prism") {
      ctx.beginPath();
      ctx.moveTo(0, -25);
      ctx.lineTo(19, 1);
      ctx.lineTo(10, 18);
      ctx.lineTo(-13, 14);
      ctx.lineTo(-19, -4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#f5ebf4";
      ctx.beginPath();
      ctx.moveTo(0, -25);
      ctx.lineTo(-3, 0);
      ctx.lineTo(19, 1);
      ctx.moveTo(-3, 0);
      ctx.lineTo(10, 18);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-19, 15);
      ctx.lineTo(-15, -24);
      ctx.quadraticCurveTo(0, -32, 15, -24);
      ctx.lineTo(19, 15);
      ctx.stroke();
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 9, -24);
        ctx.lineTo(i * 9, i === 0 ? 7 : -1);
        ctx.stroke();
        this.ellipse(i * 9, i === 0 ? 9 : 1, 4, 7);
      }
    }
    if (active) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#f7f6e9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation = 0,
  ): void {
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private plant(x: number, y: number, scale: number, rotation: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    ctx.strokeStyle = "#5e806e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 15);
    ctx.quadraticCurveTo(3, 0, 0, -23);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? "#7f9c76" : "#91aa80";
      this.ellipse(i % 2 ? 8 : -8, -i * 8, 11, 5, i % 2 ? -0.7 : 0.7);
    }
    ctx.restore();
  }

  private food(x: number, y: number, cue: Cue): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#344c3825";
    this.ellipse(x + 2, y + 9, 12, 4);
    ctx.fillStyle = COLORS[cue];
    ctx.strokeStyle = "#52654d66";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (cue === "amber") ctx.ellipse(x, y, 8, 11, 0.5, 0, Math.PI * 2);
    else if (cue === "blue") ctx.arc(x, y, 9, 0, Math.PI * 2);
    else {
      ctx.moveTo(x, y - 11);
      ctx.bezierCurveTo(x + 17, y - 8, x + 10, y + 13, x, y + 9);
      ctx.bezierCurveTo(x - 10, y + 13, x - 17, y - 8, x, y - 11);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff88";
    this.ellipse(x - 3, y - 4, 2.5, 3.5, 0.5);
    ctx.strokeStyle = "#607759";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 9);
    ctx.quadraticCurveTo(x + 1, y - 17, x + 6, y - 15);
    ctx.stroke();
  }

  private creature(world: World): void {
    const ctx = this.ctx;
    const c = world.creature;
    const time = world.tick / 10;
    const bounce =
      this.reduced || c.action.kind === "rest"
        ? Math.sin(time * 1.5) * 1
        : Math.sin(time * 9) * 2;
    ctx.fillStyle = "#304e4833";
    this.ellipse(c.x, c.y + 21, 29, 9);
    ctx.save();
    ctx.translate(c.x, c.y + bounce);
    if (!c.alive) ctx.rotate(-0.45);
    const body = ctx.createRadialGradient(-10, -18, 0, 0, 0, 38);
    body.addColorStop(0, c.alive ? "#f5f4c7" : "#c7c9ae");
    body.addColorStop(1, c.alive ? "#bdd68d" : "#a9b699");
    ctx.fillStyle = body;
    ctx.strokeStyle = "#627d57";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-25, 9);
    ctx.bezierCurveTo(-31, -10, -24, -34, -4, -32);
    ctx.bezierCurveTo(22, -36, 31, -13, 27, 9);
    ctx.bezierCurveTo(27, 30, -25, 30, -25, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#8daa6d";
    this.ellipse(-13, 23, 9, 5);
    this.ellipse(15, 23, 9, 5);
    ctx.strokeStyle = "#607e59";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-4, -31);
    ctx.quadraticCurveTo(-7, -48, 4, -50);
    ctx.stroke();
    ctx.fillStyle = "#e5c66b";
    this.ellipse(6, -51, 8, 4.5, -0.45);
    const look = Math.cos(c.heading) * 2.5;
    ctx.fillStyle = "#244d43";
    if (c.alive) {
      this.ellipse(-10 + look, -5, 2.6, 4);
      this.ellipse(11 + look, -5, 2.6, 4);
    } else {
      ctx.strokeStyle = "#244d43";
      ctx.beginPath();
      ctx.moveTo(-14, -4);
      ctx.lineTo(-7, -4);
      ctx.moveTo(7, -4);
      ctx.lineTo(14, -4);
      ctx.stroke();
    }
    ctx.fillStyle = "#e3a39188";
    this.ellipse(-18, 2, 5, 2.8);
    this.ellipse(19, 2, 5, 2.8);
    ctx.strokeStyle = "#497157";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-3, 5);
    ctx.quadraticCurveTo(1, 9, 5, 5);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#365b4c";
    ctx.font = "500 13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Milo", c.x, c.y + 49);
  }

  destroy(): void {
    this.observer.disconnect();
  }
}

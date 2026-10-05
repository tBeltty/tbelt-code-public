import { readFile } from 'node:fs/promises'

export interface Widget {
  id: string
  weight: number
}

export class WidgetFactory {
  build(id: string): Widget {
    return { id, weight: 0 }
  }
}

export function describeWidget(widget: Widget): string {
  return `${widget.id} (${widget.weight})`
}

void readFile

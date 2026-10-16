import { REPO } from '../lib/data'
import { fmtDate } from '../lib/format'
import { Dot } from './Status'

export function Honesty({ date }: { date: string }) {
  return (
    <p className="honesty">
      Example public accounts. I picked them for their public documents. They aren't leads, and I know nothing about your
      pipeline. Pages were fetched on {fmtDate(date)} and the run is replayed here, so nothing runs live. The Zoho side is a
      draft that has never run in your org, and the field names are my guesses. Rows tagged <span className="tag tag--sample">sample</span> are
      made up.
    </p>
  )
}

export function Owner() {
  return (
    <p className="owner">
      Abdallah Safi <Dot /> Computer Engineering, Toronto Metropolitan University <Dot />{' '}
      <a href={REPO} target="_blank" rel="noreferrer">
        github.com/PohTeyToe/riipen-waysights
      </a>
    </p>
  )
}

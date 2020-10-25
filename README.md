# re-mem

> Fork of [mem](https://github.com/sindresorhus/mem/) with "staleWhileRevalidate" and "staleIfError"

![Node.js CI](https://github.com/fabsrc/re-mem/workflows/Node.js%20CI/badge.svg)

## Install

```shell
npm install -S re-mem
```

## Usage

```js
import reMem from "re-mem"

function getData(id) {
  return Promise.resolve(`Data: ${id}`)
}
const getDataMemoized = reMem(getData, {
  maxAge: 1000,
  staleWhileRevalidate: 10000,
  staleIfError: 20000
})

getDataMemoized(123)
  .then(console.log)
  .catch(console.error)
```

### Options

- `cacheKey` Function that returns a cache key based on arguments passed to a function. By default the first argument is used as cache key
- `cache` Custom cache to store data in. (Default: `new Map()`)
- `cacheError` Boolean flag wether to cache errors or not (Default: `false`)
- `maxAge` Time in ms to return the cached promise (Default: `Infinity`)
- `staleWhileRevalidate` Time in ms to return stale data while revalidating the data in the background. The time starts after `maxAge` runs out.
- `staleIfError` Time in ms to return stale data if original promise rejects with an error.

## Development

### Testing

```shell
npm test
```


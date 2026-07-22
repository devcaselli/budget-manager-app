import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Tag } from '../models/tag';
import { TagService } from './tag.service';

const TAGS_URL = '/api/tags';

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return { id: 'tag-1', name: 'Travel', parentId: null, ...overrides };
}

describe('TagService', () => {
  let service: TagService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TagService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads the flat tag list into tags$', () => {
    const tags = [makeTag(), makeTag({ id: 'tag-2', name: 'Uber', parentId: 'tag-1' })];
    const emitted: (readonly Tag[])[] = [];
    service.tags$.subscribe((v) => emitted.push(v));

    service.loadAll();

    const req = httpMock.expectOne(TAGS_URL);
    expect(req.request.method).toBe('GET');
    req.flush(tags);

    expect(emitted.at(-1)).toEqual(tags);
  });

  it('sets error$ when loading fails', () => {
    const errors: (string | null)[] = [];
    service.error$.subscribe((v) => errors.push(v));

    service.loadAll();
    httpMock.expectOne(TAGS_URL).flush(null, { status: 500, statusText: 'Error' });

    expect(errors.at(-1)).toBe('Não foi possível carregar as tags.');
  });

  it('appends a created tag to tags$', () => {
    service.loadAll();
    httpMock.expectOne(TAGS_URL).flush([makeTag({ id: 'tag-1' })]);

    const created = makeTag({ id: 'tag-2', name: 'Groceries' });
    const emitted: (readonly Tag[])[] = [];
    service.tags$.subscribe((v) => emitted.push(v));

    let result: Tag | undefined;
    service.create({ name: 'Groceries' }).subscribe((t) => (result = t));

    const req = httpMock.expectOne(TAGS_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Groceries' });
    req.flush(created);

    expect(result).toEqual(created);
    expect(emitted.at(-1)).toEqual([makeTag({ id: 'tag-1' }), created]);
  });

  it('sets a friendly error when creating a subtag-of-subtag (422 hierarchy violation)', () => {
    const errors: (string | null)[] = [];
    service.error$.subscribe((v) => errors.push(v));

    let errored = false;
    service
      .create({ name: 'Broken', parentId: 'subtag-1' })
      .subscribe({ error: () => (errored = true) });

    httpMock.expectOne(TAGS_URL).flush(null, { status: 422, statusText: 'Unprocessable Entity' });

    expect(errored).toBe(true);
    expect(errors.at(-1)).toBe('Uma subtag não pode ser usada como tag-pai.');
  });

  it('replaces the updated tag in tags$', () => {
    const original = makeTag({ id: 'tag-1', name: 'Travel' });
    service.loadAll();
    httpMock.expectOne(TAGS_URL).flush([original]);

    const updated = makeTag({ id: 'tag-1', name: 'Trips' });
    const emitted: (readonly Tag[])[] = [];
    service.tags$.subscribe((v) => emitted.push(v));

    service.update('tag-1', { name: 'Trips' }).subscribe();
    const req = httpMock.expectOne(`${TAGS_URL}/tag-1`);
    expect(req.request.method).toBe('PUT');
    req.flush(updated);

    expect(emitted.at(-1)).toEqual([updated]);
  });

  it('deletes a tag and reloads the list (backend cascades subtags server-side)', () => {
    const root = makeTag({ id: 'tag-1' });
    const remaining = makeTag({ id: 'tag-2', name: 'Other' });
    service.loadAll();
    httpMock.expectOne(TAGS_URL).flush([root, remaining]);

    const emitted: (readonly Tag[])[] = [];
    service.tags$.subscribe((v) => emitted.push(v));

    service.delete('tag-1').subscribe();

    const deleteReq = httpMock.expectOne(`${TAGS_URL}/tag-1`);
    expect(deleteReq.request.method).toBe('DELETE');
    deleteReq.flush(null);

    httpMock.expectOne(TAGS_URL).flush([remaining]);

    expect(emitted.at(-1)).toEqual([remaining]);
  });

  it('keeps deleting$ set until the post-delete reload completes (no re-click window)', () => {
    const deletingStates: (string | null)[] = [];
    service.deleting$.subscribe((v) => deletingStates.push(v));

    service.delete('tag-1').subscribe();

    const deleteReq = httpMock.expectOne(`${TAGS_URL}/tag-1`);
    deleteReq.flush(null);

    // DELETE response landed, but the reload GET hasn't resolved yet — still "deleting".
    expect(deletingStates.at(-1)).toBe('tag-1');

    httpMock.expectOne(TAGS_URL).flush([]);

    // Only now, after the reload settles, does the row become clickable again.
    expect(deletingStates.at(-1)).toBeNull();
  });

  it('propagates a delete error and resets deleting$', () => {
    const deletingStates: (string | null)[] = [];
    service.deleting$.subscribe((v) => deletingStates.push(v));

    let errored = false;
    service.delete('tag-1').subscribe({ error: () => (errored = true) });
    httpMock.expectOne(`${TAGS_URL}/tag-1`).flush(null, { status: 500, statusText: 'Error' });

    expect(errored).toBe(true);
    expect(deletingStates.at(-1)).toBeNull();
  });
});

import { recipeDraftSchema } from '@app/domain/recipe';
import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
import { op } from '../op.ts';
import { versionedInput, versionedOutput } from '../versioned.ts';
import { PHOTO_INPUT_TYPES, PHOTO_MAX_INPUT_BYTES, photoView } from './photos.ts';
import {
	bookView,
	checkView,
	departmentSchema,
	draftSavesView,
	draftSaveView,
	draftView,
	ingredientMatchView,
	ingredientView,
	overviewView,
	publishedView,
	recipeMatchView,
	restoredView,
	statusView,
	synonymsSchema,
	unitCodeSchema,
	varietyHintView,
	versionDetailView,
	versionListView,
} from './views.ts';

/** Recipe-book management for curators (spec sections 8 and 13): global, never per family. */
const read = () => op({ mcp: { readOnly: true }, offline: false, role: 'curator' });
/** Reads that depend only on the catalogue counter (drafts never move it). */
const versionedRead = () => op({ mcp: { readOnly: true }, offline: false, role: 'curator', reads: ['catalogue'] });
const write = () => op({ mcp: { readOnly: false }, offline: false, role: 'curator' });
const create = () => op({ mcp: { readOnly: false }, offline: false, role: 'curator', creates: true });
const notFound = { not_found: errorDefinitions.not_found };
const conflict = { conflict: errorDefinitions.conflict };
const notAllowed = { not_allowed: errorDefinitions.not_allowed };
const draftId = z.object({ draftId: z.uuid() });
const recipeId = z.object({ recipeId: z.uuid() });
const ingredientId = z.object({ ingredientId: z.uuid() });
const revision = z.number().int().min(1);
/** Checked again on the bytes by the server; the codes are those of the image field. */
const photoFile = z
	.file()
	.refine((file) => (PHOTO_INPUT_TYPES as readonly string[]).includes(file.type), 'photo_type')
	.refine((file) => file.size <= PHOTO_MAX_INPUT_BYTES, 'photo_too_large');
const nameInput = z.object({ 'it-IT': z.string().trim().min(1).max(80), 'en-GB': z.string().trim().max(80).nullable() });

export const catalogueContract = {
	getGuide: read()
		.route({
			method: 'GET',
			path: '/catalogue/guide',
			summary: 'Read this first: how to add or change recipes as a curator, what publishing requires and how to write ingredient lines',
		})
		.input(z.object({}))
		.output(z.object({ guide: z.string() })),
	overview: read()
		.route({
			method: 'GET',
			path: '/catalogue/overview',
			summary: 'Open recipe drafts (new recipes and revisions, with what they still miss to publish) and archived recipes',
		})
		.input(z.object({}))
		.output(overviewView),
	getDraft: read()
		.route({
			method: 'GET',
			path: '/catalogue/drafts/{draftId}',
			summary: 'A draft as saved, with its revision (pass it back when saving), publication problems as codes and paths, and US-cup conversions',
		})
		.errors(notFound)
		.input(draftId)
		.output(draftView),
	listDraftSaves: read()
		.route({
			method: 'GET',
			path: '/catalogue/drafts/{draftId}/saves',
			summary:
				'Every save of a draft, open or closed, newest first, with who saved it, when and whether another save overwrote it: find work lost to an overwrite here',
		})
		.errors(notFound)
		.input(draftId)
		.output(draftSavesView),
	getDraftSave: read()
		.route({
			method: 'GET',
			path: '/catalogue/drafts/{draftId}/saves/{revision}',
			summary:
				'The content of one save of a draft. To recover it, show it to the curator and save it again with catalogue_saveDraft (an open draft) or catalogue_startRevision then catalogue_saveDraft (a closed revision)',
		})
		.errors(notFound)
		.input(draftId.extend({ revision: z.coerce.number().int().min(1) }))
		.output(draftSaveView),
	createDraft: create()
		.route({
			method: 'POST',
			path: '/catalogue/drafts',
			summary:
				'Start a new recipe as a draft (at least a name in one language); incomplete data is fine, wrong data is refused with codes and paths. Repeating the same id returns the same draft',
		})
		.input(z.object({ id: z.uuid(), content: recipeDraftSchema }))
		.output(draftView),
	startRevision: create()
		.route({
			method: 'POST',
			path: '/catalogue/recipes/{recipeId}/revision',
			summary: 'Edit a published or archived recipe: opens its revision draft, or returns the one already open (one per recipe, shared by curators)',
		})
		.errors({ ...notFound, ...notAllowed })
		.input(recipeId.extend({ id: z.uuid() }))
		.output(draftView),
	saveDraft: write()
		.route({
			method: 'PUT',
			path: '/catalogue/drafts/{draftId}',
			summary:
				'Save a draft from the revision you read (baseRevision). If another curator saved meanwhile you get a conflict with their version: take it, or overwrite it by passing overwriteRevision',
		})
		.errors({ ...notFound, ...conflict })
		.input(draftId.extend({ baseRevision: revision, content: recipeDraftSchema, overwriteRevision: revision.optional() }))
		.output(draftView),
	checkDraft: read()
		.route({
			method: 'GET',
			path: '/catalogue/drafts/{draftId}/check',
			summary: 'Run the full publication check on the saved draft without publishing: problems as codes and paths, and the US-cup conversions publishing would apply',
		})
		.errors(notFound)
		.input(draftId)
		.output(checkView),
	publish: write()
		.route({
			method: 'POST',
			path: '/catalogue/drafts/{draftId}/publish',
			summary:
				'Publish the latest revision of a draft after the curator confirmed the complete card. A revision started from an older version needs confirmVersion set to the current version',
		})
		.errors({ ...notFound, ...conflict })
		.input(draftId.extend({ confirmVersion: revision.optional() }))
		.output(publishedView),
	discardDraft: write()
		.route({
			method: 'POST',
			path: '/catalogue/drafts/{draftId}/discard',
			summary: 'Discard a revision, or a new recipe never published and not cited by any meal',
		})
		.errors({ ...notFound, ...notAllowed })
		.input(draftId)
		.output(z.object({ draftId: z.uuid(), recipeId: z.uuid(), kind: z.enum(['new', 'revision']) })),
	searchRecipes: versionedRead()
		.route({
			method: 'GET',
			path: '/catalogue/recipes',
			summary:
				'Find published and archived recipes of the whole catalogue by name or description in your language (empty text: all, by name). Start here to revise, archive or restore a recipe',
		})
		.input(versionedInput(z.object({ text: z.string().trim().max(60).default(''), status: z.enum(['published', 'archived', 'any']).default('any') })))
		.output(versionedOutput(z.object({ items: z.array(recipeMatchView) }))),
	setArchived: write()
		.route({
			method: 'PUT',
			path: '/catalogue/recipes/{recipeId}/archived',
			summary: 'Archive a published recipe (out of the recipe book, search and plans; meals keep it) or bring it back with archived: false',
		})
		.errors({ ...notFound, ...notAllowed })
		.input(recipeId.extend({ archived: z.boolean() }))
		.output(statusView),
	listVersions: versionedRead()
		.route({
			method: 'GET',
			path: '/catalogue/recipes/{recipeId}/versions',
			summary: 'Published versions of a recipe, newest first, with who published them and when',
		})
		.errors(notFound)
		.input(versionedInput(recipeId))
		.output(versionedOutput(versionListView)),
	getVersion: versionedRead()
		.route({
			method: 'GET',
			path: '/catalogue/recipes/{recipeId}/versions/{version}',
			summary: 'One version of a recipe as it was, with the problems it would have if restored today',
		})
		.errors(notFound)
		.input(versionedInput(recipeId.extend({ version: z.coerce.number().int().min(1) })))
		.output(versionedOutput(versionDetailView)),
	restoreVersion: write()
		.route({
			method: 'POST',
			path: '/catalogue/recipes/{recipeId}/versions/{version}/restore',
			summary: 'Publish an older version again as a new version, after showing it to the curator; confirmVersion is the current version you saw',
		})
		.errors({ ...notFound, ...conflict, ...notAllowed })
		.input(recipeId.extend({ version: z.coerce.number().int().min(1), confirmVersion: revision }))
		.output(restoredView),
	searchIngredients: versionedRead()
		.route({
			method: 'GET',
			path: '/catalogue/ingredients',
			summary: 'Find catalogue ingredients by name, synonym or a variety already used, in your language (at least 2 letters). Search before creating one',
		})
		.input(versionedInput(z.object({ text: z.string().trim().min(2).max(60) })))
		.output(versionedOutput(z.object({ items: z.array(ingredientMatchView) }))),
	getIngredient: versionedRead()
		.route({
			method: 'GET',
			path: '/catalogue/ingredients/{ingredientId}',
			summary: 'An ingredient with its version, names, synonyms, department, pantry flag and recipe equivalences (with their ids): read it before changing it',
		})
		.errors(notFound)
		.input(versionedInput(ingredientId))
		.output(versionedOutput(ingredientView)),
	listVarieties: versionedRead()
		.route({
			method: 'GET',
			path: '/catalogue/ingredients/{ingredientId}/varieties',
			summary: 'Varieties already written for an ingredient in published recipes, most used first: reuse their spelling',
		})
		.errors(notFound)
		.input(versionedInput(ingredientId))
		.output(
			versionedOutput(
				z.object({ varieties: z.array(z.object({ variety: z.object({ 'it-IT': z.string(), 'en-GB': z.string() }), uses: z.number().int().min(1) })) }),
			),
		),
	checkVariety: read()
		.route({
			method: 'GET',
			path: '/catalogue/ingredients/{ingredientId}/variety-check',
			summary: 'Advice on a variety you are about to write (existing spelling, ingredient name repeated, preparation words); resolve every hint',
		})
		.errors(notFound)
		.input(ingredientId.extend({ text: z.string().trim().min(1).max(40), locale: z.enum(['it-IT', 'en-GB']) }))
		.output(z.object({ hints: z.array(varietyHintView) })),
	createIngredient: create()
		.route({
			method: 'POST',
			path: '/catalogue/ingredients',
			summary: 'Add a generic product to the catalogue (no variety, size or preparation in the name), with its shop department',
		})
		.input(
			z.object({
				id: z.uuid(),
				name: nameInput,
				department: departmentSchema,
				isPantry: z.boolean().default(false),
				synonyms: synonymsSchema.optional(),
			}),
		)
		.output(ingredientView),
	updateIngredient: write()
		.route({
			method: 'PUT',
			path: '/catalogue/ingredients/{ingredientId}',
			summary:
				'Change names, synonyms, department or pantry flag of an ingredient for every recipe, from the version you read with catalogue_getIngredient',
		})
		.errors({ ...notFound, ...conflict })
		.input(ingredientId.extend({ baseVersion: revision, name: nameInput, synonyms: synonymsSchema, department: departmentSchema, isPantry: z.boolean() }))
		.output(ingredientView),
	setEquivalence: write()
		.route({
			method: 'PUT',
			path: '/catalogue/ingredients/{ingredientId}/equivalences',
			summary:
				'Set how a US cup (or another unit) of this ingredient converts for recipes, with the source of the figure; updates the one with the same unit kind and preparation, and repeating it changes nothing',
		})
		.errors(notFound)
		.input(
			ingredientId.extend({
				fromUnit: unitCodeSchema,
				toUnit: unitCodeSchema,
				factor: z.number().positive(),
				preparation: z.string().trim().max(60).nullable().default(null),
				source: z.string().trim().min(1).max(200),
			}),
		)
		.output(ingredientView),
	removeEquivalence: write()
		.route({
			method: 'DELETE',
			path: '/catalogue/ingredients/{ingredientId}/equivalences/{equivalenceId}',
			summary: 'Remove a recipe equivalence of an ingredient; removing one already gone is fine',
		})
		.errors(notFound)
		.input(ingredientId.extend({ equivalenceId: z.uuid() }))
		.output(ingredientView),
	listBooks: versionedRead()
		.route({ method: 'GET', path: '/catalogue/books', summary: 'Books of the catalogue, for recipes taken from a book' })
		.input(versionedInput(z.object({})))
		.output(versionedOutput(z.object({ books: z.array(bookView) }))),
	createBook: create()
		.route({
			method: 'POST',
			path: '/catalogue/books',
			summary: 'Add a book to the catalogue by its original title. Repeating the same id returns the same book',
		})
		.input(z.object({ id: z.uuid(), title: z.string().trim().min(1).max(200) }))
		.output(bookView.omit({ archived: true })),
	uploadPhoto: op({ mcp: false, offline: false, role: 'curator', creates: true })
		.route({
			method: 'POST',
			path: '/catalogue/recipes/{recipeId}/photo/upload',
			summary: 'Add or replace the photo of a recipe with a JPEG, PNG or WebP file (web app only: agents use catalogue_setPhotoFromUrl)',
		})
		.errors(notFound)
		.input(z.object({ id: z.uuid(), recipeId: z.uuid(), file: photoFile }))
		.output(photoView),
	setPhotoFromUrl: create()
		.route({
			method: 'PUT',
			path: '/catalogue/recipes/{recipeId}/photo',
			summary:
				'Add or replace the photo of a recipe from the https address of a JPEG, PNG or WebP image, usually from the source page (og:image or the schema.org recipe image). Show the image to the curator first and set it only after an explicit yes',
		})
		.errors(notFound)
		.input(z.object({ id: z.uuid(), recipeId: z.uuid(), imageUrl: z.string().trim().min(1).max(2048) }))
		.output(photoView),
	removePhoto: write()
		.route({
			method: 'DELETE',
			path: '/catalogue/recipes/{recipeId}/photo',
			summary: 'Remove the photo of a recipe, after the curator confirmed; removing one already gone is fine',
		})
		.errors(notFound)
		.input(recipeId)
		.output(photoView),
};
